# CBP's CAPE Declaration upload template (exact format)

Sources, fetched 2026-10-30:
- **[FAQ]** https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds
- **[QRG]** https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf (Publication No. 5552-0526, May 2026)

| Item | What CBP publishes | What we write |
|---|---|---|
| Template | QRG Topic 1: the CAPE Upload dialog's "CAPE Upload Template" link downloads `ACEP_CapeEntryNumberUploadTemplate`. | `cape-declaration-<n>-of-<N>.csv` (one per declaration) |
| Header | QRG: "Enter the applicable entry number(s) in the first column, vertically, beginning in the second row below the Entry Number title row ... do not delete the Entry Number title in the first row." Error: "CSV content is empty or missing the header: CSV needs Entry Number header and at least 1 entry number". | Row 1 is exactly `Entry Number`, single column |
| Other columns | FAQ: "CBP does not require any other information in the .CSV file." | None |
| File type | QRG: "The file must be saved with the CSV (Comma delimited) (*.csv) file type." Error: "Not a CSV file". | `.csv` |
| Encoding | Not published. | UTF-8, **no BOM** (a BOM would stick to the header and read as a missing header), CRLF line ends (what Excel's CSV save writes) |
| Entry number | QRG Topic 2: "11 alphanumeric characters. Dash is optional (any special characters will be stripped prior to 11-character validation)". QRG Topic 3: "Not 11 characters long: Entry Number must be 11 characters without dashes". | 11 characters, no dashes, upper case |
| Leading zero | FAQ (updated 6/9/2026): "In order to preserve the beginning zero (0) on an entry summary number, insert an apostrophe (') directly before the zero (Example: '000-XXXXXX-XX or '000XXXXXXXX) when you complete your CSV file." | `'` directly before a leading `0` (e.g. `'00012345678`) |
| Duplicates | QRG: "No duplicate entry numbers"; error "Duplicate Entry: CSV file has duplicate Entry Numbers". | Refused before export |
| Unsafe content | Error: "The file is deemed unsafe. Please correct the file data before reuploading". | Only `A-Z 0-9` allowed, so `= + - @` formula starters are refused |
| Count limit | FAQ: "Each individual CAPE Declaration has a limit of 9,999 entries." QRG: "The number of entries is limited to 10,000 and file size is limited to 1mb"; error "The file exceeds the maximum 10,000 allowed entry numbers per file: If you have more than 10,000 entry numbers, submit multiple CSV files uploads". | **9,999** per file (the stricter of the two) |
| Size limit | QRG: "file size is limited to 1mb"; error "The file size exceeds 1mb. Please split the data into smaller files before reuploading". | Files stay under **1,000,000 bytes** (the smaller reading of "1mb"); splitting also happens on bytes |
| Filing | QRG: tick Acknowledge ("legally authorized to make the filing") then upload in the ACE Portal CAPE tab. FAQ: "A broker can include up to 9,999 entries that they filed on behalf of various IORs on a single CAPE Declaration." | UI keeps the can't-be-undone checkbox ahead of every download |
| Filer code | QRG: "First three characters of entry number must match the Filer Code of account" (Filer/Org. Broker accounts). | Not checked here (we do not know the account); noted for the broker |

## Discrepancy to know about
The FAQ says 9,999 entries per declaration; the QRG says 10,000 per file. Using 9,999 satisfies both.

## Behaviour in this repo
- `src/lib/cape-template.ts` holds the constants (with these quotes in its header comment), `validateEntryNumbers`, `buildDeclarations` (validate, split by count and bytes, number the files) and a dependency-free store-only `zipFiles`.
- If anything is invalid (blank, wrong length, bad characters, duplicates, nothing selected) the export is **refused** with CBP's error wording and no file is produced.
- More than one file: numbered `cape-declaration-1-of-N.csv` ... plus a zip button and a plain note ("Customs allows at most 9,999 shipments and 1 MB per file ... Upload each one separately").
- Tests: `tests/cape-template.test.ts`.
