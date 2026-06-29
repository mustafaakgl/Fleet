# Fleet Design Token Sistemi

## Renk Paleti

| Token | Hex | Kullanım |
|---|---|---|
| Primary | `#003366` | Dark Blue |
| Secondary | `#4CAF50` | Bright Green |
| Warning | `#FF9800` | Orange |
| Error | `#F44336` | Red |
| Background | `#F5F7FA` | Soft Gray |
| Text | `#333333` | Dark Gray |
| Info | `#2196F3` | Light Blue |

## Typography (Inter / Roboto)

| Element | Size | Weight |
|---|---|---|
| H1 | 32px | 600 |
| H2 | 24px | 600 |
| H3 | 20px | 600 |
| Body | 16px | 400 |
| Caption | 12px | 400 |

## Component Library Öncelikleri

1. Tables — Sort/filter, hover states, zebra striping
2. Graphs/Charts — Interactive, tooltip, drill-down
3. Alerts/Notifications — Modal dialoglar, eylem odaklı
4. Buttons — Primary, secondary, disabled states
5. Form Elements — Input, checkbox, toggle + error mesajları

## Data Visualization Stratejisi

- KPI Widgets — Trend okları, sparkline, status göstergesi
- Bar/Line Graphs — Zaman bazlı metrik karşılaştırması
- Heat Maps — Bakım planı / yakıt tüketimi yoğunluğu

## Status/State Dili

| State | Renk | Metin Örneği |
|---|---|---|
| Success | Yeşil | "Operation Successful" |
| Warning | Turuncu | "Action Required" |
| Error | Kırmızı | "Something went wrong" |

## Responsive Grid

- 12 kolon grid (`grid-cols-12`)
- Breakpoints: 576px / 768px / 992px / 1200px
- Mobil touch target: min 48x48px (`min-w-touch`, `min-h-touch`)
