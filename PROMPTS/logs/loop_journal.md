# Loop Journal

[2026-06-19] [faz0] [repo-setup] [CLAUDE.md repo köküne eklendi; faz0-temel-onarim branch açıldı]
[2026-06-19] [faz0] [m1-schema] [4 tachograph Prisma modeli + migration + tenant kaydı tamamlandı]
[2026-06-19] [faz0] [m1-service] [tachograph.service tipli erişim + SHA-256 idempotency + transaction]
[2026-06-19] [faz0] [m1-upload-tests] [5MB upload validation + parser/upload/ingest spec'leri; batarya yeşil (codec8 gateway kapalı ortamda atlandı)]
[2026-07-02] [faz1] [sim-scenarios] [codec8-sim: 5 senaryo, seed'li PRNG, özet JSON]
[2026-07-02] [faz1] [verify-script] [verify-tacho-telematics.mjs: DB karşılaştırma, quarantine skipped]
[2026-07-02] [faz1] [demo-seed] [seed-tacho-demo: 2 sürücü/araç/cihaz, 14g aktivite, idempotent]
[2026-07-02] [faz1] [loop-verify] [npm run loop:verify yeşil x2; gateway child + tracking spec deterministik]
[2026-07-02] [faz2a] [rules-engine] [561/2006 pure rules + specs + service integration; golden reference 3 ihlal]
[2026-07-02] [faz2b] [ddd-parser] [Annex 1C parser + imza doğrulama + servis entegrasyonu; loop:verify yeşil 138 test; LEGAL-REVIEW: signature RSA-SHA256/ECDSA şeması, rules ISO week UTC]
[2026-07-02] [faz2c] [plan] [Journal bulguları: corrupt-frames quarantine skipped; CRC reject quarantine yok; DTC clear clearedAt yok; gateway doğrudan DB yazıyor — hedef: ACK-after-queue, consumer, trip builder, watchdog]
[2026-07-02] [faz2c] [result] [loop:verify ALL GREEN — 144 unit tests; gateway→BullMQ/inline queue→consumer; ACK-after-enqueue; TelemetryQuarantine; DTC bit-diff; trip close (ignition OFF+debounce); fuel-theft alarm+4h suppression; load 1k; live-stream-smoke; sim DTC IO id 48 (Codec8 1-byte)]
