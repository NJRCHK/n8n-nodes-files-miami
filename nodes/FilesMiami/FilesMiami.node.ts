import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { readStoredZip } from './zip';

const API = 'https://api.files.miami';

// Error codes the API returns as {"error": CODE, "request_id": ...}.
const errors: Record<string, [string, string]> = {
	INVALID_API_KEY: [
		'files.miami rejected the API key',
		'Check the key in your files.miami credential, or create a new one in your workspace.',
	],
	INSUFFICIENT_BALANCE: [
		'Your files.miami balance is empty',
		'Add credit at https://files.miami/workspace/billing.',
	],
	PROJECT_BUDGET_EXCEEDED: [
		'This project reached its monthly budget',
		'Raise or remove the budget in your files.miami workspace.',
	],
	ACCOUNT_DISABLED: ['This files.miami account is disabled', 'Contact files.miami support.'],
	UPLOAD_TOO_LARGE: ['The file is larger than 1 GB', 'files.miami accepts documents up to 1 GB.'],
	CONVERSION_FAILED: [
		'files.miami could not convert this file',
		'Send a DOCX, DOC, ODT or RTF document. The file may be damaged or password-protected.',
	],
	DEADLINE_EXCEEDED: [
		'The conversion took longer than 120 seconds',
		'Very large documents can exceed the deadline. Try splitting the document.',
	],
	UPLOAD_TIMEOUT: [
		'The upload timed out',
		'Try again; check the connection from n8n to the internet.',
	],
	SERVICE_UNAVAILABLE: [
		'files.miami is busy',
		'Try again in a moment. Enable "Retry On Fail" in the node settings to retry automatically.',
	],
	INVALID_DPI: ['Unsupported DPI', 'Choose 72, 150 or 300 DPI.'],
	INVALID_MULTIPART: [
		'files.miami could not read the upload',
		'Check that the input binary field holds a file.',
	],
};

// One file part. Percent-encoding the quote keeps the filename intact; the API
// decodes percent escapes once, so literal percents are encoded first.
function multipart(file: Buffer, fileName: string, mimeType: string) {
	const boundary = `----n8nFilesMiami${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
	const name = fileName
		.replace(/[\r\n]/g, '')
		.replace(/%/g, '%25')
		.replace(/"/g, '%22');
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
			`Content-Type: ${mimeType}\r\n\r\n`,
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
	return {
		body: Buffer.concat([head, file, tail]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

function baseName(fileName: string) {
	return fileName.replace(/\.[^./\\]*$/, '') || 'document';
}

export class FilesMiami implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'files.miami',
		name: 'filesMiami',
		icon: { light: 'file:filesMiami.svg', dark: 'file:filesMiami.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] === "png" ? "Convert to PNG" : "Convert to PDF"}}',
		description: 'Convert Word documents (DOCX, DOC, ODT, RTF) to PDF or PNG',
		defaults: { name: 'files.miami' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'filesMiamiApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Convert to PDF',
						value: 'pdf',
						description: 'Convert a document to a PDF file',
						action: 'Convert a document to PDF',
					},
					{
						name: 'Convert to PNG',
						value: 'png',
						description: 'Render each page of a document as a PNG image',
						action: 'Convert a document to PNG images',
					},
				],
				default: 'pdf',
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the input binary field containing the document',
			},
			{
				displayName: 'DPI',
				name: 'dpi',
				type: 'options',
				options: [
					{ name: '72 (Screen)', value: 72 },
					{ name: '150', value: 150 },
					{ name: '300 (Print)', value: 300 },
				],
				default: 150,
				description: 'Resolution of the page images',
				displayOptions: { show: { operation: ['png'] } },
			},
			{
				displayName: 'Output',
				name: 'pngOutput',
				type: 'options',
				options: [
					{
						name: 'One Item per Page',
						value: 'pages',
						description: 'Output a separate item with one PNG for each page',
					},
					{
						name: 'ZIP File',
						value: 'zip',
						description: 'Output one ZIP file holding every page and a JSON manifest',
					},
				],
				default: 'pages',
				displayOptions: { show: { operation: ['png'] } },
			},
			{
				displayName: 'Output Binary Field',
				name: 'outputPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the output binary field to put the converted file in',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const inputField = this.getNodeParameter('binaryPropertyName', i) as string;
				const outputField = this.getNodeParameter('outputPropertyName', i) as string;
				const input = this.helpers.assertBinaryData(i, inputField);
				const file = await this.helpers.getBinaryDataBuffer(i, inputField);
				const fileName = input.fileName || 'document.docx';
				const { body, contentType } = multipart(
					file,
					fileName,
					input.mimeType || 'application/octet-stream',
				);

				const dpi = operation === 'png' ? (this.getNodeParameter('dpi', i) as number) : 0;
				const request: IHttpRequestOptions = {
					method: 'POST',
					url: operation === 'png' ? `${API}/v1/images?dpi=${dpi}` : `${API}/v1`,
					headers: { 'Content-Type': contentType },
					body,
					encoding: 'arraybuffer',
					json: false,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
					timeout: 300_000,
				};
				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'filesMiamiApi',
					request,
				)) as { body: ArrayBuffer | Buffer; headers: Record<string, string>; statusCode: number };
				const data = Buffer.from(response.body as ArrayBuffer);

				if (response.statusCode >= 400) {
					let code = '';
					let requestId = response.headers['x-request-id'] ?? '';
					try {
						const parsed = JSON.parse(data.toString('utf8')) as {
							error?: string;
							request_id?: string;
						};
						code = parsed.error ?? '';
						requestId = parsed.request_id ?? requestId;
					} catch {
						// Not a JSON error body; report the status alone.
					}
					const [message, description] = errors[code] ?? [
						`files.miami returned HTTP ${response.statusCode}`,
						data.toString('utf8').slice(0, 300),
					];
					throw new NodeApiError(
						this.getNode(),
						{ error: code, request_id: requestId } as JsonObject,
						{
							message,
							description: requestId ? `${description} (request ${requestId})` : description,
							httpCode: String(response.statusCode),
							itemIndex: i,
						},
					);
				}

				const requestId = response.headers['x-request-id'];
				const base = baseName(fileName);
				if (operation === 'pdf') {
					returnData.push({
						json: { fileName: `${base}.pdf`, sourceFileName: fileName, requestId } as IDataObject,
						binary: {
							[outputField]: await this.helpers.prepareBinaryData(
								data,
								`${base}.pdf`,
								'application/pdf',
							),
						},
						pairedItem: { item: i },
					});
					continue;
				}

				if (this.getNodeParameter('pngOutput', i) === 'zip') {
					returnData.push({
						json: {
							fileName: `${base}-pages.zip`,
							sourceFileName: fileName,
							dpi,
							requestId,
						} as IDataObject,
						binary: {
							[outputField]: await this.helpers.prepareBinaryData(
								data,
								`${base}-pages.zip`,
								'application/zip',
							),
						},
						pairedItem: { item: i },
					});
					continue;
				}

				const entries = readStoredZip(data);
				const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as {
					page_count?: number;
					pages?: Array<{ page: number; file: string; width: number; height: number }>;
				};
				for (const page of manifest.pages ?? []) {
					const png = entries.get(page.file);
					if (!png)
						throw new NodeOperationError(
							this.getNode(),
							`Page ${page.page} is missing from the response`,
							{ itemIndex: i },
						);
					const name = `${base}-page-${String(page.page).padStart(4, '0')}.png`;
					returnData.push({
						json: {
							fileName: name,
							sourceFileName: fileName,
							page: page.page,
							pageCount: manifest.page_count,
							width: page.width,
							height: page.height,
							dpi,
							requestId,
						} as IDataObject,
						binary: { [outputField]: await this.helpers.prepareBinaryData(png, name, 'image/png') },
						pairedItem: { item: i },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				const nodeError =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				throw nodeError;
			}
		}

		return [returnData];
	}
}
