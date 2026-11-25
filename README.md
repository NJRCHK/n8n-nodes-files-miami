# n8n-nodes-files-miami

An [n8n](https://n8n.io/) community node for [files.miami](https://files.miami/?utm_source=n8n), a fast
document conversion API. Convert Word documents (DOCX, DOC, ODT and RTF) to PDF, or render their pages as
PNG images, from any workflow.

Typical uses: turn contracts generated from a Word template into PDFs, convert attachments from email or
Google Drive before archiving them, or make page previews of uploaded documents.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) ·
[Example](#example) · [Pricing](#pricing) · [Compatibility](#compatibility)

## Installation

In n8n, open **Settings → Community nodes → Install**, enter `n8n-nodes-files-miami`, and confirm. See
n8n's [community node installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
for details.

## Credentials

1. Sign up at [files.miami](https://files.miami/signup?utm_source=n8n) and open **API keys** in your
   workspace to create a key.
2. In n8n, create a **files.miami API** credential and paste the key.
3. Click **Test** to check it. The test sends an empty upload, so it costs nothing and adds nothing to your
   conversion history.

## Operations

**Convert to PDF.** Reads a document from an input binary field (`data` by default) and outputs the PDF in
an output binary field. The output item's JSON holds the file names and the files.miami request ID.

**Convert to PNG.** Renders every page at 72, 150 or 300 DPI. Choose the output:

- **One Item per Page** (default): one item per page, each with a PNG and its `page`, `pageCount`, `width`,
  `height` and `dpi`. Use this to save or send individual pages.
- **ZIP File**: one ZIP holding `page-0001.png`, `page-0002.png` and so on, plus a `manifest.json` listing
  each page's size.

The node accepts files up to 1 GB. files.miami detects the format from the file's contents, so the file
name and MIME type don't need to be exact.

Errors come back as readable messages: an invalid key, an empty balance, a file that isn't a supported
document, or a busy service. Turn on **Retry On Fail** in the node's settings to retry the last case
automatically. With **Continue On Fail**, failed items carry an `error` field and the rest of the batch
continues.

## Example

Convert every Word file added to a Google Drive folder and email the PDF:

```
Google Drive Trigger (file created) → Google Drive (download) → files.miami (Convert to PDF) → Gmail (send, attachment: data)
```

## Pricing

Each successful conversion costs $0.005, plus $0.15 per GB for output over 5 MB, with no monthly plan.
Failed conversions are free. See [files.miami](https://files.miami/?utm_source=n8n) for current pricing.

## Compatibility

Tested with n8n 2.49. The node has no runtime dependencies.

## Resources

- [files.miami](https://files.miami/?utm_source=n8n)
- [How fast is files.miami? Benchmarks](https://files.miami/benchmarks?utm_source=n8n)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
