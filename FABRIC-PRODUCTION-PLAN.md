# Tartanism Fabric Production Plan

## Executive Summary

This document outlines the technical requirements, manufacturer options, and implementation roadmap for enabling users to order custom tartan fabric directly from the Tartanism app.

---

## 1. Manufacturing Options

### Tier 1: Print-on-Demand (MVP - Recommended Starting Point)

| Provider | API Available | MOQ | Cost/Yard | Lead Time | Best For |
|----------|--------------|-----|-----------|-----------|----------|
| **Printful** | ✅ REST API | 1 yard | $10-15 | 5-7 days | MVP, fastest integration |
| **Printify** | ✅ REST API | 1 yard | $8-12 | 5-10 days | Price-sensitive customers |
| **Spoonflower** | ❌ No API | 1 yard | $17-28 | 7-14 days | Craft/quilting market |
| **Gooten** | ✅ REST API | 1 yard | $12-18 | 5-8 days | International shipping |

**Recommendation**: Start with **Printful** - mature API, extensive documentation, good fabric quality.

### Tier 2: Digital Fabric Printing (Medium Volume)

| Provider | MOQ | Cost/Yard | Lead Time | Notes |
|----------|-----|-----------|-----------|-------|
| **Fabric.com Custom** | 5 yards | $15-25 | 2-3 weeks | Amazon-owned, reliable |
| **Contrado** | 1 meter | £15-30 | 1-2 weeks | UK-based, good quality |
| **CustomInk** | 10 yards | $12-20 | 2-3 weeks | B2B focused |

### Tier 3: Traditional Woven Tartan (Premium)

| Manufacturer | Location | MOQ | Cost/Yard | Lead Time | Contact |
|--------------|----------|-----|-----------|-----------|---------|
| **Lochcarron of Scotland** | Scotland | 30 yards | $30-60 | 6-8 weeks | sales@lochcarron.com |
| **House of Edgar** | Scotland | 25 yards | $35-70 | 6-10 weeks | info@houseofedgar.com |
| **Strathmore Woollen Co** | Scotland | 20 yards | $40-80 | 8-12 weeks | Direct inquiry |
| **Pendleton Woolen Mills** | USA | 50 yards | $25-45 | 4-8 weeks | B2B portal |
| **Marton Mills** | England | 30 yards | $28-55 | 6-8 weeks | sales@martonmills.com |

**For Artisan/Small Batch:**
- **Araminta Campbell** (Scotland) - Bespoke handwoven, $150+/yard
- **Johnstons of Elgin** - Luxury cashmere tartans, $200+/yard

---

## 2. Technical File Requirements

### For Digital Printing (Print-on-Demand)

```
Format: PNG or JPG
Resolution: 150 DPI minimum (300 DPI recommended)
Color Space: sRGB
Tile Size: Seamless repeat pattern
File Size: Max 100MB typically
```

**Implementation in Tartanism:**
```typescript
// Add to App.tsx - Export for printing
const exportForPrinting = (canvas: HTMLCanvasElement, dpi: number = 300) => {
  // Scale canvas to target DPI
  const scaleFactor = dpi / 96; // Browser default is 96 DPI
  const printCanvas = document.createElement('canvas');
  printCanvas.width = canvas.width * scaleFactor;
  printCanvas.height = canvas.height * scaleFactor;

  const ctx = printCanvas.getContext('2d');
  ctx?.scale(scaleFactor, scaleFactor);
  ctx?.drawImage(canvas, 0, 0);

  return printCanvas.toDataURL('image/png');
};
```

### For Traditional Weaving

```
Format: WIF (Weaving Information File) - Already implemented!
Additional: Technical specification sheet with:
  - Thread count notation
  - Yarn weight (typically 2/28 or 2/36 for worsted)
  - Sett (threads per inch) - typically 60-80 for tartan
  - Color specifications (Pantone references)
```

**Pantone Matching (Critical for Woven):**
| Tartan Color | Pantone Code | Notes |
|--------------|--------------|-------|
| Royal Stewart Red | 18-1664 TCX | Fiery Red |
| Black Watch Navy | 19-4024 TCX | Dress Blues |
| Black Watch Green | 19-5918 TCX | Trekking Green |
| Ancient Gold | 14-1031 TCX | Buff |

---

## 3. Implementation Architecture

### Phase 1: Export Enhancement (Week 1-2)

```
┌─────────────────────────────────────────────────────────────┐
│                     CURRENT STATE                           │
├─────────────────────────────────────────────────────────────┤
│  Tartanism App                                              │
│  ├── Generate Pattern                                       │
│  ├── Export WIF ✅                                          │
│  ├── Yarn Calculator ✅                                     │
│  └── PNG Export (low-res) ⚠️                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     PHASE 1 TARGET                          │
├─────────────────────────────────────────────────────────────┤
│  Tartanism App                                              │
│  ├── Generate Pattern                                       │
│  ├── Export WIF ✅                                          │
│  ├── Yarn Calculator ✅                                     │
│  ├── Export High-Res PNG (300 DPI) 🆕                      │
│  ├── Export Seamless Tile 🆕                               │
│  └── Export Technical Spec Sheet 🆕                        │
└─────────────────────────────────────────────────────────────┘
```

**New Features:**
1. High-resolution PNG export (user-selectable DPI)
2. Seamless tile export (single pattern repeat)
3. Technical specification PDF with:
   - Pattern preview
   - Thread count notation
   - Suggested Pantone colors
   - Sett recommendations

### Phase 2: Print-on-Demand Integration (Week 3-6)

```
┌─────────────────────────────────────────────────────────────┐
│                     USER FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User designs tartan in app                              │
│           │                                                 │
│           ▼                                                 │
│  2. Clicks "Order Fabric"                                   │
│           │                                                 │
│           ▼                                                 │
│  3. Selects fabric type & quantity                          │
│      ├── Cotton Poplin ($10/yd)                            │
│      ├── Cotton Twill ($12/yd)                             │
│      ├── Linen ($15/yd)                                    │
│      └── Wool Blend ($22/yd)                               │
│           │                                                 │
│           ▼                                                 │
│  4. Preview at actual size                                  │
│           │                                                 │
│           ▼                                                 │
│  5. Checkout via Printful                                   │
│           │                                                 │
│           ▼                                                 │
│  6. Fabric shipped direct to user                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Printful API Integration:**
```typescript
// printful-service.ts
interface PrintfulProduct {
  id: number;
  name: string;
  variant_id: number;
  price: number;
}

const FABRIC_PRODUCTS = {
  cotton_poplin: { variant_id: 10738, price: 9.95, name: 'Cotton Poplin' },
  cotton_twill: { variant_id: 10739, price: 11.95, name: 'Cotton Twill' },
  linen_cotton: { variant_id: 10740, price: 14.95, name: 'Linen-Cotton' },
  // Note: Actual variant IDs need to be fetched from Printful catalog
};

export const createPrintfulOrder = async (
  patternImage: string,
  productVariant: string,
  quantity: number,
  shippingAddress: ShippingAddress
) => {
  const response = await fetch('https://api.printful.com/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: shippingAddress,
      items: [{
        variant_id: FABRIC_PRODUCTS[productVariant].variant_id,
        quantity,
        files: [{
          type: 'default',
          url: patternImage // Or base64 data URL
        }]
      }]
    })
  });
  return response.json();
};
```

### Phase 3: Premium Woven Inquiry System (Week 7-10)

For traditional woven fabric (higher MOQ, longer lead times):

```
┌─────────────────────────────────────────────────────────────┐
│                   INQUIRY FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. User designs tartan                                     │
│           │                                                 │
│           ▼                                                 │
│  2. Clicks "Get Quote for Woven Fabric"                     │
│           │                                                 │
│           ▼                                                 │
│  3. App generates inquiry package:                          │
│      ├── WIF file                                          │
│      ├── Technical spec sheet                              │
│      ├── High-res preview                                  │
│      └── Suggested Pantone colors                          │
│           │                                                 │
│           ▼                                                 │
│  4. User selects manufacturer(s)                            │
│      ├── Lochcarron (Scotland)                             │
│      ├── House of Edgar (Scotland)                         │
│      └── Pendleton (USA)                                   │
│           │                                                 │
│           ▼                                                 │
│  5. Inquiry sent via email or form                          │
│           │                                                 │
│           ▼                                                 │
│  6. Manufacturer responds with quote                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. MVP Implementation Checklist

### Week 1-2: Export Enhancements

- [ ] Add DPI selector to export options (72, 150, 300 DPI)
- [ ] Implement seamless tile export
- [ ] Create technical spec sheet generator (PDF)
- [ ] Add Pantone color suggestions based on hex values
- [ ] Test exports at production scale

### Week 3-4: Printful Integration Setup

- [ ] Create Printful developer account
- [ ] Get API credentials
- [ ] Build fabric product catalog integration
- [ ] Implement pattern upload flow
- [ ] Add shipping address form
- [ ] Implement checkout flow

### Week 5-6: Order Management

- [ ] Build order confirmation UI
- [ ] Add order tracking integration
- [ ] Implement order history (localStorage or account system)
- [ ] Add email notifications
- [ ] Test end-to-end order flow

### Week 7-8: Woven Fabric Inquiry

- [ ] Build manufacturer directory
- [ ] Create inquiry package generator
- [ ] Implement email-based inquiry flow
- [ ] Add quote request tracking

### Week 9-10: Polish & Launch

- [ ] Add pricing calculator
- [ ] Create fabric guide/FAQ
- [ ] Implement A/B testing for conversion
- [ ] Launch beta with select users

---

## 5. Cost Structure

### For Users

| Option | Min Order | Cost | Best For |
|--------|-----------|------|----------|
| Digital Print | 1 yard | $10-25/yd | Prototypes, small projects |
| Bulk Digital | 10+ yards | $8-18/yd | Crafters, small businesses |
| Woven Tartan | 20-30 yards | $30-80/yd | Authentic products, brands |

### For Tartanism (Revenue Model)

**Option A: Affiliate/Referral**
- Printful: 10-15% commission on orders
- No inventory risk
- Easiest to implement

**Option B: Wholesale Markup**
- Buy at wholesale, sell at retail
- 30-50% margin possible
- Requires inventory management

**Option C: Licensing**
- License patterns to manufacturers
- Royalty per yard produced
- Passive income stream

**Recommended**: Start with **Option A** (affiliate), graduate to **Option B** as volume grows.

---

## 6. Quality Control Checkpoints

### Digital Printing

1. **File Validation**
   - Resolution check (>150 DPI)
   - Color space verification (sRGB)
   - Seamless tile validation

2. **Proof Approval**
   - Digital mockup preview
   - Scale reference indicators
   - Color accuracy notice

3. **Sample Order**
   - Recommend first-time buyers order 1 yard sample
   - Compare to screen preview

### Woven Fabric

1. **Strike-Off**
   - Manufacturer weaves 6-12" sample
   - Color matching verification
   - Pattern accuracy check

2. **Approval Loop**
   - Customer approves strike-off
   - Adjustments if needed
   - Sign-off before production

3. **Final Inspection**
   - Thread count verification
   - Color consistency across run
   - Selvage quality check

---

## 7. Legal Considerations

### Tartan Registration

- **Scottish Register of Tartans**: Official registration available
- Cost: Free for personal tartans, fee for commercial
- Website: tartanregister.gov.uk

### Copyright

- Original tartan designs are copyrightable
- Historic/clan tartans are public domain
- Include terms of service for user-generated patterns

### Trademarks

- Clan associations may have trademark claims
- Clear disclaimers needed for "inspired by" designs
- Consider trademark search for commercial patterns

---

## 8. Technical Appendix

### Printful API Endpoints

```
Base URL: https://api.printful.com/

GET /products - List all products
GET /products/{id} - Get product details
POST /orders - Create order
GET /orders/{id} - Get order status
POST /orders/{id}/confirm - Confirm order
GET /shipping/rates - Calculate shipping
```

### WIF File Enhancement for Production

```wif
[WIF]
Version=1.1
Date=2024-01-15
Developers=Tartanism
Source Program=Tartanism Web App
Source Version=1.0

[PRODUCTION]
Intended Use=Commercial Weaving
Sett=72 EPI
Yarn Weight=2/28 worsted
Manufacturer Notes=See attached Pantone spec

[COLOR MATCHING]
; Pantone references for accurate reproduction
Pantone 1=18-1664 TCX (Red)
Pantone 2=19-4024 TCX (Navy)
Pantone 3=19-5918 TCX (Green)
```

### Recommended Fabric Types by Use Case

| Use Case | Fabric | Weight | Printful Product |
|----------|--------|--------|------------------|
| Quilting | Cotton Poplin | 4.3 oz | ID: 10738 |
| Apparel | Cotton Twill | 5.8 oz | ID: 10739 |
| Home Decor | Linen-Cotton | 7.8 oz | ID: 10740 |
| Upholstery | Canvas | 10 oz | ID: 10741 |

---

## Next Steps

1. **Immediate**: Implement high-res export (300 DPI) - foundation for all production
2. **This Week**: Set up Printful developer account
3. **Next Week**: Build basic order flow prototype
4. **Month 1**: Launch print-on-demand beta
5. **Month 2**: Add woven fabric inquiry system

---

*Document generated by Tartanism Production Planning*
*Last updated: January 2026*
