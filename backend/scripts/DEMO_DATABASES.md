# BeanBridge Coffee — Demo Databases

Two Postgres databases representing the same coffee chain's NYC and NJ stores. Use them to test Waggle's cross-source graph linking.

---

## Setup

```bash
# Create and seed both databases (run from repo root)
createdb waggle_nyc
createdb waggle_nj

psql waggle_nyc < backend/scripts/seed_nyc.sql
psql waggle_nj  < backend/scripts/seed_nj.sql
```

---

## Connect in Waggle

Add each database as a separate Postgres source via **Add Source → Connect Postgres**.

| Field    | NYC store              | NJ store               |
|----------|------------------------|------------------------|
| Host     | `localhost`            | `localhost`            |
| Port     | `5432`                 | `5432`                 |
| Database | `waggle_nyc`           | `waggle_nj`            |
| User     | `postgres`             | `postgres`             |
| Password | _(your local PG pass)_ | _(your local PG pass)_ |
| Label    | `BeanBridge NYC`       | `BeanBridge NJ`        |

Once both are added, open **Source Graph** (the branch icon in the sidebar) to visualize and link them.

---

## waggle_nyc — BeanBridge New York City

**7 tables · ~4,700 rows · Jan–Jun 2025**

| Table         | Rows  | Description                              |
|---------------|-------|------------------------------------------|
| `categories`  | 8     | Menu categories (Espresso, Bakery, etc.) |
| `products`    | 48    | Menu items with NYC prices               |
| `staff`       | 15    | Employees (baristas, managers)           |
| `customers`   | 400   | NYC loyalty members                      |
| `promotions`  | 8     | Discount codes                           |
| `orders`      | 1,200 | Customer orders (in-store + online)      |
| `order_items` | 2,800 | Line items per order                     |
| `returns`     | 30    | Refunded orders                          |

### Key columns

```
categories  id, name, description
products    id, sku, name, category_id → categories.id, price, cost, active
staff       id, name, role, hourly_rate, hire_date
customers   id, first_name, last_name, email, loyalty_pts, joined_at, neighborhood
promotions  id, code, discount_pct, valid_from, valid_until
orders      id, customer_id → customers.id, staff_id → staff.id,
            order_total, discount_amt, status, channel, ordered_at
order_items id, order_id → orders.id, product_id → products.id,
            quantity, unit_price, subtotal
returns     id, order_id → orders.id, reason, refund_amt, returned_at
```

---

## waggle_nj — BeanBridge New Jersey (Hoboken)

**8 tables · ~3,800 rows · Jan–Jun 2025**

| Table                  | Rows  | Description                                     |
|------------------------|-------|-------------------------------------------------|
| `categories`           | 8     | Same categories as NYC                          |
| `products`             | 48    | Same SKUs as NYC, prices ~5–10% lower           |
| `suppliers`            | 8     | Ingredient and goods suppliers                  |
| `staff`                | 12    | NJ employees                                    |
| `customers`            | 320   | NJ loyalty members (80 shared with NYC)         |
| `orders`               | 960   | Customer orders                                 |
| `order_items`          | 2,400 | Line items                                      |
| `inventory`            | 48    | Current stock level per product                 |
| `purchase_orders`      | 180   | Orders placed with suppliers                    |
| `purchase_order_items` | 405   | Line items per purchase order                   |
| `shipments`            | 120   | Deliveries from NJ warehouse to NYC store       |
| `shipment_items`       | 320   | Products per shipment                           |

### Key columns

```
categories     id, name, description
products       id, sku, name, category_id → categories.id, price, cost, active
suppliers      id, name, contact_email, city, lead_days
staff          id, name, role, hourly_rate, hire_date
customers      id, first_name, last_name, email, loyalty_pts, joined_at, neighborhood
orders         id, customer_id → customers.id, staff_id → staff.id,
               order_total, discount_amt, status, channel, ordered_at
order_items    id, order_id → orders.id, product_id → products.id,
               quantity, unit_price, subtotal
inventory      id, product_id → products.id, sku, qty_on_hand,
               reorder_point, reorder_qty, supplier_id → suppliers.id
purchase_orders        id, supplier_id → suppliers.id, status, ordered_at, received_at, total_cost
purchase_order_items   id, purchase_order_id → purchase_orders.id,
                       product_id → products.id, quantity, unit_cost, subtotal
shipments              id, destination, status, shipped_at, delivered_at, tracking_number
shipment_items         id, shipment_id → shipments.id, product_id → products.id, sku, quantity
```

---

## Cross-Source Joins

These are the intended links to draw in the Waggle Source Graph.

### 1. Product catalog (the main join)

**NYC `products.sku` → NJ `products.sku`** · JOIN type: `LEFT`

Both stores sell the same 48 products under the same SKU codes (`BB-001` through `BB-048`). NYC prices are ~5–10% higher.

**Use case questions:**
- "Which products have the biggest price difference between NYC and NJ?"
- "Compare total units sold per SKU across both stores"
- "Which products sell more in NYC vs NJ?"

```sql
SELECT n.sku, n.name,
       n.price  AS nyc_price,
       j.price  AS nj_price,
       ROUND((n.price - j.price) / j.price * 100, 1) AS pct_premium
FROM waggle_nyc.products n
JOIN waggle_nj.products j ON n.sku = j.sku
ORDER BY pct_premium DESC;
```

---

### 2. Shared loyalty customers

**NYC `customers.email` → NJ `customers.email`** · JOIN type: `INNER`

80 customers are registered at both stores (same email, same loyalty program). NJ emails `1–80` use the same naming pattern as NYC.

**Use case questions:**
- "Which customers shop at both locations?"
- "What is the combined lifetime spend of cross-store customers?"
- "Do shared customers prefer NYC or NJ for specific product categories?"

---

### 3. Inventory vs sales velocity

**NJ `inventory.sku` → NYC `order_items` (via `products.sku`)** · JOIN type: `LEFT`

The NJ store holds inventory for both locations. Linking NJ inventory to NYC sales lets you ask whether stock levels match NYC demand.

**Use case questions:**
- "Which products are understocked at NJ relative to how fast they sell in NYC?"
- "Show reorder urgency: products where NJ qty_on_hand < 2 weeks of NYC sales"

---

### 4. Shipments from NJ to NYC

**NJ `shipment_items.sku` → NYC `products.sku`** · JOIN type: `LEFT`

The NJ warehouse ships products to the NYC store. Linking shipments to NYC product performance tells you whether deliveries match sales pace.

**Use case questions:**
- "How many units of each product were shipped to NYC in the last 30 days?"
- "Which products are shipped frequently but sell slowly in NYC?"

---

## Suggested Link Order in Source Graph

Draw these edges in the Source Graph canvas in this order for the best demo flow:

1. `NYC products.sku` → `NJ products.sku` *(price comparison)*
2. `NYC customers.email` → `NJ customers.email` *(loyalty analysis)*
3. `NJ inventory.sku` → `NYC products.sku` *(stock vs demand)*
4. `NJ shipment_items.sku` → `NYC products.sku` *(logistics)*
