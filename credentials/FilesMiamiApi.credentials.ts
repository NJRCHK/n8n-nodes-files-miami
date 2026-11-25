import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FilesMiamiApi implements ICredentialType {
	name = 'filesMiamiApi';

	displayName = 'files.miami API';

	icon: Icon = { light: 'file:filesMiami.svg', dark: 'file:filesMiami.svg' };

	documentationUrl = 'https://github.com/NJRCHK/n8n-nodes-files-miami#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'fm_…',
			description: 'Create a key under API keys in your files.miami workspace',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// The API checks the key before it reads the upload, and rejects an empty
	// file before converting anything: a valid key gets 400 INVALID_MULTIPART,
	// with nothing charged or added to the conversion history.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.files.miami',
			url: '/v1',
			method: 'POST',
			headers: { 'Content-Type': 'multipart/form-data; boundary=n8n-credential-test' },
			body:
				'--n8n-credential-test\r\nContent-Disposition: form-data; name="file"; filename="n8n-credential-test.docx"\r\n' +
				'Content-Type: application/octet-stream\r\n\r\n\r\n--n8n-credential-test--\r\n',
			json: true,
			ignoreHttpStatusErrors: true,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error',
					value: 'INVALID_API_KEY',
					message: 'files.miami rejected this API key',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error',
					value: 'ACCOUNT_DISABLED',
					message: 'This files.miami account is disabled',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error',
					value: 'INSUFFICIENT_BALANCE',
					message:
						'The key works, but the files.miami balance is empty. Add credit at https://files.miami/workspace/billing',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error',
					value: 'PROJECT_BUDGET_EXCEEDED',
					message: 'The key works, but its project has reached its monthly budget',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'error',
					value: 'SERVICE_UNAVAILABLE',
					message: 'files.miami is busy; try again in a moment',
				},
			},
		],
	};
}
