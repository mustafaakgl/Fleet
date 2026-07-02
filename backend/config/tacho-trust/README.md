# Tachograph trust store (ERCA / MSCA certificates)

Place EU tachograph root and member-state CA certificates in this directory so Annex 1C
DDD signature verification can validate card and VU downloads in production.

## Expected files

- ERCA root CA certificate(s) — `.pem`, `.crt`, or `.cer`
- Member State CA (MSCA) intermediate certificates as needed for your card/VU chain

The parser loads every `*.pem`, `*.crt`, and `*.cer` file from this folder at runtime.

## Where to obtain certificates

Download current ERCA / MSCA trust material from the EU Joint Research Centre (JRC) ERCA page:

https://dtc.jrc.ec.europa.eu/dtccs-web/publication/erca

Follow the published certificate policy for tachograph digital signatures (Annex 1B / 1C).

## Format

- PEM (preferred) or DER wrapped as `.crt` / `.cer`
- RSA public keys for Gen1 card signatures
- EC public keys for Gen2 card signatures (when present in your trust pack)

## Empty folder behaviour

If no certificates are configured, uploads are **not blocked**: `signatureValid` is stored as `null`
and `signature.details` includes `trust store not configured`. Install certificates here before
acceptance-testing real `.ddd` files from hardware.

## Security

- Do not commit production private keys.
- Only public CA certificates belong in this directory.
