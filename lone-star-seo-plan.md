# Lone Star Tortillas — SEO & Content Action Plan

## Context

This plan is based on automated analysis from QuadBot, which monitors lonestartortillas.com via Google Search Console and Google Ads. The data covers Feb 8–28, 2026. The recommendations below have been filtered to only include actionable, high-value items — removing duplicates, noise, and ads-related suggestions.

**Site:** lonestartortillas.com — a Next.js site hosted on Vercel that sells authentic H-E-B tortillas shipped nationwide.

**Core business model:** People who miss H-E-B tortillas (Texas expatriates, etc.) can order them for delivery anywhere in the US.

---

## Priority 1: Fix Declining Core Commercial Queries (CRITICAL)

### 1A. Recover "heb tortillas shipped" Rankings

**Problem:** The primary commercial query "heb tortillas shipped" dropped from position 4.3 to 6.8, with CTR collapsing from 17.6% to 6.7%. This is the money query — people searching this are ready to buy.

**Actions:**

- Find the landing page that ranks for "heb tortillas shipped" (likely the homepage or a product page)
- Update the `<title>` tag to include the exact phrase "HEB Tortillas Shipped" — e.g., `HEB Tortillas Shipped Nationwide | Lone Star Tortillas`
- Update the `<meta name="description">` to be compelling and action-oriented, e.g., "Get authentic H-E-B tortillas shipped directly to your door. Fast nationwide delivery in 2-4 days. The same tortillas you love from Texas."
- Ensure the H1 on the page includes "HEB Tortillas Shipped" or very close variation
- Add structured data (Product schema with shipping info) if not already present
- Check for any technical issues: broken links, slow load times, redirect chains
- Ensure the page has clear CTAs and shipping information above the fold

### 1B. Recover "heb butter tortillas shipped"

**Problem:** This query went from 2 clicks / 15 impressions / 10% CTR to zero. Complete loss.

**Actions:**

- Check if there's a dedicated page for butter tortillas specifically
- If not, create one: `/products/heb-butter-tortillas` or similar
- Title: "HEB Butter Tortillas Shipped Nationwide | Lone Star Tortillas"
- Content should specifically address butter tortilla availability, shipping details, and ordering
- If a page exists, check for technical issues (404, redirects, noindex)

### 1C. Fix "lone star tortillas" Brand Query

**Problem:** The brand query dropped from position 5.0 to 8.2. You should be #1 for your own name.

**Actions:**

- Homepage title should lead with "Lone Star Tortillas" — e.g., `Lone Star Tortillas — Authentic HEB Tortillas Shipped Nationwide`
- Check Google Business Profile is claimed and consistent
- Search for "lone star tortillas" and see what's outranking you — could be social profiles, directory listings, or a different business
- Ensure consistent NAP (Name, Address, Phone) across all web mentions
- Add Organization schema to the homepage with the brand name

---

## Priority 2: Capture High-Volume Informational Traffic

### 2A. Create Tortilla Freezing & Storage Guide

**Problem:** The query "freezing sprouted whole grain tortillas defrosting tips" has 160+ impressions per week at position ~19, but 0% CTR. Massive untapped potential.

**Actions:**

- Create a comprehensive blog post: **"How to Freeze and Defrost Tortillas: The Complete Guide"**
- Cover: which tortillas freeze well, step-by-step freezing instructions, defrosting methods (microwave, stovetop, room temp), how long they last frozen, tips for maintaining texture
- Mention sprouted whole grain tortillas specifically (match the exact query)
- Include practical tips with photos or illustrations if possible
- Add FAQ schema for common questions
- Internal link to product pages: "Looking for shelf-stable tortillas that ship well? Check out our [product]"
- URL: `/blog/how-to-freeze-and-defrost-tortillas`
- Meta title: "How to Freeze & Defrost Tortillas (Sprouted, Corn, Flour) | Lone Star Tortillas"

### 2B. Create Tortilla Health & Nutrition Content

**Problem:** Multiple nutrition queries showing impressions but ranking terribly:

- "are corn tortillas healthy" — position 52
- "are tortillas healthy" — position 17.6
- "how many corn tortillas can i eat a day" — position 6.5 (close to page 1!)
- "tortillas nutrition" — poor position
- "nutritional value of corn tortillas" — poor position

**Actions:**

- Create **"Are Tortillas Healthy? Nutrition Facts, Calories & Benefits"**
  - Cover corn vs flour vs whole wheat nutrition comparisons
  - Include actual nutrition data (calories, carbs, protein, fiber)
  - Address "how many tortillas can I eat" question directly
  - Compare to bread, wraps, and other alternatives
  - URL: `/blog/are-tortillas-healthy-nutrition-guide`
  - Meta title: "Are Tortillas Healthy? Complete Nutrition Guide (Corn vs Flour) | Lone Star Tortillas"

- Create **"Corn Tortilla Nutrition: Calories, Benefits & Daily Intake"**
  - Deep dive specifically on corn tortillas
  - Answer "how many corn tortillas can I eat a day" — this is close to page 1 already
  - Cover gluten-free benefits, fiber content, whole grain advantages
  - URL: `/blog/corn-tortilla-nutrition`
  - Meta title: "How Many Corn Tortillas Can You Eat a Day? Nutrition Facts & Health Benefits"

### 2C. Create Tortilla Delivery Landing Page

**Problem:** "tortillas delivery" jumped from position 39 to 15, gaining impressions, but 0% CTR. People are searching for delivery but not clicking.

**Actions:**

- If no dedicated delivery page exists, create one at `/delivery` or `/shipping`
- Title: "Tortilla Delivery — Authentic HEB Tortillas Shipped to Your Door"
- Meta description: "Order authentic Texas tortillas for delivery anywhere in the US. Fast 2-4 day shipping. Same H-E-B tortillas you love, delivered fresh."
- Content: delivery areas, shipping times, how packaging works, freshness guarantee
- If a page exists, just update the meta title and description to be more compelling for the "delivery" intent

---

## Priority 3: Content Opportunities (Medium Priority)

### 3A. Breakfast Taco Content

**Opportunity:** Multiple breakfast taco queries appeared — "breakfast tacos," "texas style breakfast tacos." Low volume but strong brand fit.

**Action:**

- Create **"Authentic Texas Breakfast Tacos: Recipes & Tips"**
- Include 3-4 recipes using tortillas
- Showcase how Lone Star Tortillas are perfect for breakfast tacos
- Good for social sharing and brand personality
- URL: `/blog/texas-breakfast-tacos`

### 3B. "Texas Tortilla" Position Defense

**Opportunity:** "texas tortilla" is ranking #1 with low impressions. Worth defending and expanding.

**Action:**

- Create or expand content about Texas tortilla traditions, what makes Texas tortillas different, regional varieties
- This supports brand authority and could grow impressions over time

---

## Priority 4: Technical SEO Fixes

### 4A. Add Structured Data

If not already present on the site, add:

- **Organization schema** on homepage (brand name, logo, social links)
- **Product schema** on product pages (name, price, availability, shipping)
- **Article schema** on all blog posts
- **FAQ schema** on pages with Q&A content
- **BreadcrumbList schema** for site navigation

### 4B. Internal Linking Strategy

- Every blog post should link to at least 1-2 product pages
- Product pages should cross-link to related products
- Blog posts should link to each other where topically relevant
- Example: Freezing guide → links to "shelf-stable tortillas for shipping" product
- Nutrition guide → links to "corn tortillas" and "sprouted tortillas" products

---

## Implementation Checklist

### Quick Wins (can do in one session)

- [ ] Update homepage title tag to include "Lone Star Tortillas" prominently
- [ ] Update meta descriptions on product pages for "heb tortillas shipped" and "heb butter tortillas shipped"
- [ ] Update delivery/shipping page meta title and description
- [ ] Add Organization schema to homepage

### Content to Create (blog posts)

- [ ] "How to Freeze and Defrost Tortillas: The Complete Guide"
- [ ] "Are Tortillas Healthy? Complete Nutrition Guide"
- [ ] "Corn Tortilla Nutrition: Calories, Benefits & Daily Intake"
- [ ] "Authentic Texas Breakfast Tacos: Recipes & Tips"

### Pages to Create or Optimize

- [ ] Dedicated butter tortillas product page (if missing)
- [ ] Dedicated delivery/shipping landing page (if missing)
- [ ] Texas tortilla traditions page (if missing)

### Technical

- [ ] Product schema on all product pages
- [ ] Article schema on all blog posts
- [ ] FAQ schema where applicable
- [ ] BreadcrumbList schema
- [ ] Internal linking audit and updates

---

## What NOT To Change

- **Google Ads budgets or campaigns** — leave these untouched
- **Site architecture / routing** — no need to restructure, just add content and optimize existing pages
- **Design / layout** — focus is on content and meta tags, not visual changes

---

## Measurement

After implementing these changes, the QuadBot GSC daily digest will automatically track:

- Position changes for target queries
- CTR improvements
- Click and impression trends
- New query appearances

Check back in 2-3 weeks to see if the changes are having an impact. SEO changes typically take 1-4 weeks to show in search results.
