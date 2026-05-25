-- ──────────────────────────────────────────────────────────────────────────────
-- waggle_nj — BeanBridge Coffee, New Jersey (Hoboken) store
-- Medium-sized seed: ~3,800 rows · 8 tables · Jan–Jun 2025
--
-- Cross-source link target: products.sku matches waggle_nyc.products.sku
-- Also: customers.email overlaps ~20% with waggle_nyc (shared loyalty members)
-- Run against: createdb waggle_nj && psql waggle_nj < seed_nj.sql
-- ──────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS shipment_items, shipments, purchase_order_items, purchase_orders,
  inventory, order_items, orders, customers, staff, products, suppliers, categories CASCADE;

-- ── CATEGORIES (identical to NYC — same brand) ────────────────────────────────

CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

INSERT INTO categories (name, description) VALUES
  ('Espresso Drinks', 'All espresso-based hot and iced beverages'),
  ('Cold Brew & Iced', 'Cold brew, nitro, and iced coffee drinks'),
  ('Tea & Matcha', 'Hot and iced teas, matcha lattes'),
  ('Bakery', 'Fresh-baked pastries, muffins, and breads'),
  ('Sandwiches & Wraps', 'Hot and cold savory options'),
  ('Retail Beans', 'Whole bean and ground coffee for home brewing'),
  ('Merchandise', 'Mugs, tumblers, and BeanBridge branded items'),
  ('Seasonal Specials', 'Limited time and holiday offerings');

-- ── PRODUCTS (same SKUs as NYC — NJ prices slightly lower) ───────────────────

CREATE TABLE products (
  id         SERIAL PRIMARY KEY,
  sku        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  category_id INT NOT NULL REFERENCES categories(id),
  price      NUMERIC(6,2) NOT NULL,   -- NJ prices ~5-10% lower
  cost       NUMERIC(6,2) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO products (sku, name, category_id, price, cost) VALUES
  ('BB-001', 'Espresso Shot',          1, 2.25,  0.45),
  ('BB-002', 'Americano',              1, 3.50,  0.55),
  ('BB-003', 'Cappuccino',             1, 4.75,  0.90),
  ('BB-004', 'Latte',                  1, 5.25,  1.00),
  ('BB-005', 'Flat White',             1, 5.00,  0.95),
  ('BB-006', 'Cortado',                1, 4.25,  0.80),
  ('BB-007', 'Macchiato',              1, 4.50,  0.85),
  ('BB-008', 'Mocha',                  1, 5.75,  1.20),
  ('BB-009', 'Oat Milk Latte',         1, 6.25,  1.40),
  ('BB-010', 'Vanilla Latte',          1, 6.00,  1.30),
  ('BB-011', 'Cold Brew 12oz',         2, 4.75,  0.70),
  ('BB-012', 'Nitro Cold Brew',        2, 5.75,  0.90),
  ('BB-013', 'Iced Americano',         2, 4.00,  0.65),
  ('BB-014', 'Iced Latte',             2, 5.50,  1.10),
  ('BB-015', 'Iced Matcha Latte',      3, 6.00,  1.50),
  ('BB-016', 'Cold Brew Float',        2, 6.75,  1.20),
  ('BB-017', 'Matcha Latte',           3, 5.50,  1.40),
  ('BB-018', 'Chai Latte',             3, 5.25,  1.10),
  ('BB-019', 'Earl Grey Tea',          3, 3.25,  0.30),
  ('BB-020', 'London Fog',             3, 5.00,  1.00),
  ('BB-021', 'Croissant',              4, 4.00,  1.20),
  ('BB-022', 'Almond Croissant',       4, 4.50,  1.50),
  ('BB-023', 'Blueberry Muffin',       4, 3.50,  0.90),
  ('BB-024', 'Banana Bread Slice',     4, 3.75,  1.00),
  ('BB-025', 'Avocado Toast',          4, 7.95,  2.80),
  ('BB-026', 'Cinnamon Roll',          4, 4.25,  1.30),
  ('BB-027', 'Chocolate Brownie',      4, 3.25,  0.85),
  ('BB-028', 'Bagel with Cream Cheese',4, 4.75,  1.60),
  ('BB-029', 'Turkey & Brie Sandwich', 5,11.95,  4.50),
  ('BB-030', 'Veggie Wrap',            5,10.50,  3.80),
  ('BB-031', 'BLT Sandwich',           5,10.95,  4.00),
  ('BB-032', 'Egg & Cheese Sandwich',  5, 8.95,  3.20),
  ('BB-033', 'Chicken Pesto Panini',   5,12.50,  4.80),
  ('BB-034', 'House Blend 250g',       6,15.00,  5.50),
  ('BB-035', 'Ethiopia Yirgacheffe 250g',6,18.00,7.00),
  ('BB-036', 'Guatemala Antigua 250g', 6,16.50,  6.00),
  ('BB-037', 'Dark Roast Espresso 250g',6,15.50, 5.80),
  ('BB-038', 'Decaf Blend 250g',       6,16.00,  6.20),
  ('BB-039', 'BeanBridge Mug 12oz',    7,17.00,  4.00),
  ('BB-040', 'BeanBridge Tumbler 16oz',7,26.00,  7.00),
  ('BB-041', 'BeanBridge Tote Bag',    7,20.00,  5.50),
  ('BB-042', 'Travel Press',           7,33.00, 11.00),
  ('BB-043', 'Pumpkin Spice Latte',    8, 6.50,  1.60),
  ('BB-044', 'Peppermint Mocha',       8, 6.75,  1.70),
  ('BB-045', 'Lavender Latte',         8, 6.25,  1.55),
  ('BB-046', 'Honey Oat Latte',        8, 6.00,  1.45),
  ('BB-047', 'Strawberry Matcha',      8, 6.50,  1.65),
  ('BB-048', 'Brown Sugar Cold Brew',  8, 6.25,  1.40);

-- ── SUPPLIERS ─────────────────────────────────────────────────────────────────

CREATE TABLE suppliers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'USA',
  lead_days     INT NOT NULL DEFAULT 5,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO suppliers (name, contact_email, city, lead_days) VALUES
  ('Green Mountain Roasters',  'orders@gmroasters.com',       'Burlington, VT',  4),
  ('Atlantic Bakery Supply',   'supply@atlanticbakery.com',   'Newark, NJ',      2),
  ('Metro Dairy Co',           'orders@metrodairy.com',       'Jersey City, NJ', 1),
  ('Pacific Tea Importers',    'wholesale@pacifictea.com',    'Hoboken, NJ',     7),
  ('East Coast Espresso Co',   'b2b@eastcoastespresso.com',  'New York, NY',    3),
  ('Garden State Produce',     'orders@gsproducenj.com',      'Trenton, NJ',     2),
  ('BeanBridge HQ Distribution','distribution@beanbridge.com','Hoboken, NJ',     1),
  ('Nordic Coffee Imports',    'trade@nordiccoffee.com',      'Brooklyn, NY',    10);

-- ── STAFF ─────────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  hourly_rate NUMERIC(5,2) NOT NULL,
  hire_date   DATE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO staff (name, role, hourly_rate, hire_date) VALUES
  ('Lisa Park',       'Manager',   27.00, '2022-08-01'),
  ('Omar Diallo',     'Barista',   17.50, '2023-02-14'),
  ('Hannah Cruz',     'Barista',   17.25, '2023-06-05'),
  ('Ben Fitzgerald',  'Shift Lead',20.50, '2022-10-20'),
  ('Yuki Tanaka',     'Barista',   17.50, '2024-01-08'),
  ('Fatima Al-Amin',  'Barista',   17.25, '2024-03-15'),
  ('Marco Rossi',     'Barista',   17.50, '2024-04-22'),
  ('Claire Dubois',   'Shift Lead',20.00, '2023-11-30'),
  ('Devon Williams',  'Barista',   17.25, '2024-07-01'),
  ('Layla Hassan',    'Barista',   17.50, '2024-08-19'),
  ('Tyler Nguyen',    'Barista',   17.25, '2024-09-10'),
  ('Amber Scott',     'Manager',   26.50, '2023-01-15');

-- ── CUSTOMERS (320 customers; ~80 emails overlap with NYC for loyalty program) ─

CREATE TABLE customers (
  id           SERIAL PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  loyalty_pts  INT NOT NULL DEFAULT 0,
  joined_at    TIMESTAMPTZ NOT NULL,
  neighborhood TEXT
);

-- First 80: shared emails with NYC (cross-store loyalty members)
INSERT INTO customers (first_name, last_name, email, phone, loyalty_pts, joined_at, neighborhood)
SELECT
  fn, ln,
  lower(fn) || '.' || lower(ln) || gs || '@email.com',
  '201-' || lpad((gs * 7 % 900 + 100)::text, 3, '0') || '-' || lpad((gs * 13 % 9000 + 1000)::text, 4, '0'),
  (gs * 23 % 400),
  '2024-01-01'::timestamptz + (gs * 2.1 || ' days')::interval,
  (ARRAY['Hoboken','Jersey City','Weehawken','Union City','Secaucus',
         'Bayonne','Edgewater','Fort Lee','Cliffside Park','North Bergen'])[(gs % 10) + 1]
FROM (
  SELECT
    gs,
    (ARRAY['James','Maria','David','Sarah','Michael','Emily','Robert','Jessica',
           'William','Ashley','Daniel','Amanda','Matthew','Melissa','Anthony',
           'Stephanie','Mark','Rebecca','Donald','Sharon','Steven','Laura',
           'Paul','Cynthia','Andrew','Kathleen','Joshua','Angela','Kevin','Deborah',
           'Brian','Rachel','George','Carolyn','Timothy','Janet','Ronald','Catherine',
           'Edward','Frances','Jason','Ann','Jeffrey','Joyce','Ryan','Alice',
           'Jacob','Jean','Gary','Diane','Nicholas','Julie','Eric','Heather',
           'Jonathan','Teresa','Stephen','Gloria','Larry','Evelyn','Justin','Judith',
           'Scott','Martha','Brandon','Amy','Frank','Brenda','Benjamin','Anna',
           'Raymond','Pamela','Gregory','Emma','Samuel','Nicole','Patrick','Helen'])[(gs % 78) + 1] AS fn,
    (ARRAY['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
           'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson',
           'Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson',
           'White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
           'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen',
           'Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera',
           'Campbell','Mitchell','Carter','Roberts','Chen','Patel','Kim','Okafor',
           'Osei','Nakamura','Delgado','Reyes','Mehta','Park','Alvarez','Brooks',
           'Walsh','Okonkwo','Coleman','Reed','Murphy','Bailey',
           'Bell','Cooper','Richardson','Cox','Howard','Ward','Peterson',
           'Gray','James','Watson'])[(gs % 78) + 1] AS ln
  FROM generate_series(1, 80) gs
) t;

-- Next 240: NJ-only customers
INSERT INTO customers (first_name, last_name, email, phone, loyalty_pts, joined_at, neighborhood)
SELECT
  fn, ln,
  lower(fn) || '.' || lower(ln) || (gs + 500) || '@email.com',
  '201-' || lpad(((gs + 500) * 9 % 900 + 100)::text, 3, '0') || '-' || lpad(((gs + 500) * 17 % 9000 + 1000)::text, 4, '0'),
  (gs * 19 % 350),
  '2024-02-01'::timestamptz + (gs * 1.5 || ' days')::interval,
  (ARRAY['Hoboken','Jersey City','Weehawken','Union City','Secaucus',
         'Bayonne','Edgewater','Fort Lee','Cliffside Park','North Bergen'])[(gs % 10) + 1]
FROM (
  SELECT
    gs,
    (ARRAY['Liam','Olivia','Noah','Ava','Ethan','Sophia','Mason','Isabella',
           'Logan','Mia','Lucas','Charlotte','Aiden','Amelia','Jackson','Harper',
           'Caleb','Evelyn','Owen','Abigail','Nathan','Emily','Ryan','Elizabeth',
           'Julian','Sofia','Christian','Avery','Hunter','Ella','Connor','Scarlett',
           'Dylan','Grace','Landon','Lily','Aaron','Chloe','Isaac','Penelope',
           'Adam','Riley','Eli','Zoey','Miles','Nora','Levi','Sebastian',
           'Hannah','Jaxon','Layla','Brayden','Aubrey','Lincoln','Addison','Bryson',
           'Ellie','Camden','Stella','Jordan','Natalie','Tyler','Zoe','Grayson',
           'Leah','Easton','Savannah','Colton','Audrey','Josiah','Brooklyn','Evan',
           'Bella','Asher','Lucy','Parker','Paisley','Knox','Claire','Luke','Skylar',
           'Leo','Violet','Jace','Nolan','Maya','Silas','Elena','Hudson','Naomi',
           'Greyson','Alice','Nicholas','Ruby','Kayden','Willow','Axel','Eliana',
           'Cooper','Lydia','Ryder','Eliza','Dominic','Camila','Angel','Nadia',
           'Declan','Mariana','Xavier','Piper','Kai','Genesis','Blake','Autumn',
           'Ian','Ariana','Carson','Destiny','Atlas','Brielle','Jaxson','Savanna',
           'Roman','Serena','Brixton','Kinsley','Milo','Arabella','Tobias','Taylor',
           'Liam','Olivia','Noah','Ava','Ethan','Sophia','Mason','Isabella',
           'Logan','Mia','Lucas','Charlotte','Aiden','Amelia','Jackson','Harper',
           'Caleb','Evelyn','Owen','Abigail','Nathan','Emily','Ryan','Elizabeth',
           'Julian','Sofia','Christian','Avery','Hunter','Ella','Connor','Scarlett',
           'Dylan','Grace','Landon','Lily','Aaron','Chloe','Isaac','Penelope',
           'Adam','Riley','Eli','Zoey','Miles','Nora','Levi','Sebastian',
           'Hannah','Jaxon','Layla','Brayden','Aubrey','Lincoln','Addison','Bryson',
           'Ellie','Camden','Stella','Jordan','Natalie','Tyler','Zoe','Grayson',
           'Leah','Easton','Savannah','Colton','Audrey','Josiah','Brooklyn','Evan',
           'Bella','Asher','Lucy','Parker','Paisley','Knox','Claire','Luke','Skylar',
           'Leo','Violet','Jace','Nolan','Maya','Silas','Elena','Hudson','Naomi',
           'Greyson','Alice','Nicholas','Ruby','Kayden','Willow','Axel','Eliana',
           'Cooper','Lydia','Ryder','Eliza','Dominic','Camila','Angel','Nadia',
           'Declan','Mariana','Xavier','Piper','Kai','Genesis','Blake','Autumn',
           'Ian','Ariana','Carson','Destiny','Atlas','Brielle','Jaxson','Savanna',
           'Roman','Serena','Brixton','Kinsley','Milo','Arabella','Tobias','Taylor'])[(gs % 120) + 1] AS fn,
    (ARRAY['Martinez','Jackson','White','Harris','Thompson','Garcia','Anderson','Thomas',
           'Taylor','Moore','Wilson','Martin','Lee','Perez','Clark','Ramirez',
           'Lewis','Robinson','Walker','Young','Allen','King','Wright','Torres',
           'Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera',
           'Campbell','Mitchell','Carter','Roberts','Diallo','Hassan','Rossi','Dubois',
           'Nguyen','Al-Amin','Fitzgerald','Tanaka','Cruz','Park','Scott','Williams',
           'Johnson','Brown','Jones','Miller','Davis','Hernandez','Lopez','Gonzalez',
           'Sanchez','Barnes','Griffin','Reed','Cook','Morgan','Bell','Murphy',
           'Bailey','Cooper','Richardson','Cox','Howard','Ward','Peterson','Gray',
           'James','Watson','Brooks','Kelly','Sanders','Price','Bennett','Wood',
           'Ross','Henderson','Jenkins','Perry','Powell','Long','Patterson','Hughes',
           'Butler','Simmons','Foster','Gonzales','Bryant','Alexander','Russell','Diaz',
           'Hayes','Myers','Ford','Hamilton','Graham','Sullivan','Wallace','Woods',
           'West','Cole','Jordan','Owens','Reynolds','Fisher','Ellis','Harrison',
           'Gibson','Mcdonald','Marshall','Ortiz','Gomez','Murray','Freeman',
           'Wells','Webb','Simpson','Stevens','Tucker','Porter','Hunter','Hicks',
           'Crawford','Henry','Boyd','Mason','Morales','Kennedy','Warren','Dixon',
           'Ramos','Reyes','Burns','Gordon','Shaw','Holmes','Rice','Robertson',
           'Martinez','Jackson','White','Harris','Thompson','Garcia','Anderson','Thomas',
           'Taylor','Moore','Wilson','Martin','Lee','Perez','Clark','Ramirez',
           'Lewis','Robinson','Walker','Young','Allen','King','Wright','Torres',
           'Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera',
           'Campbell','Mitchell','Carter','Roberts','Diallo','Hassan','Rossi','Dubois',
           'Nguyen','Al-Amin','Fitzgerald','Tanaka','Cruz','Park','Scott','Williams',
           'Johnson','Brown','Jones','Miller','Davis','Hernandez','Lopez','Gonzalez',
           'Sanchez','Barnes','Griffin','Reed','Cook','Morgan','Bell','Murphy',
           'Bailey','Cooper','Richardson','Cox','Howard','Ward','Peterson','Gray',
           'James','Watson','Brooks','Kelly','Sanders','Price','Bennett','Wood',
           'Ross','Henderson','Jenkins','Perry','Powell','Long','Patterson','Hughes',
           'Butler','Simmons','Foster','Gonzales','Bryant','Alexander','Russell','Diaz',
           'Hayes','Myers','Ford','Hamilton','Graham','Sullivan','Wallace','Woods',
           'West','Cole','Jordan','Owens','Reynolds','Fisher','Ellis','Harrison',
           'Gibson','Mcdonald','Marshall','Ortiz','Gomez','Murray','Freeman',
           'Wells','Webb','Simpson','Stevens','Tucker','Porter','Hunter','Hicks'])[(gs % 120) + 1] AS ln
  FROM generate_series(1, 240) gs
) t;

-- ── ORDERS ────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  staff_id    INT NOT NULL REFERENCES staff(id),
  order_total NUMERIC(8,2) NOT NULL,
  discount_amt NUMERIC(6,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'completed',
  channel     TEXT NOT NULL DEFAULT 'in_store',
  ordered_at  TIMESTAMPTZ NOT NULL
);

-- ~960 orders, ~5-6/day
INSERT INTO orders (customer_id, staff_id, order_total, discount_amt, status, channel, ordered_at)
SELECT
  CASE WHEN gs % 6 = 0 THEN NULL ELSE (gs % 320) + 1 END,
  (gs % 12) + 1,
  ROUND((5.50 + (gs % 25) * 0.70 + random() * 7)::numeric, 2),
  CASE WHEN gs % 15 = 0 THEN ROUND(((gs % 25) * 0.09)::numeric, 2) ELSE 0 END,
  CASE WHEN gs % 45 = 0 THEN 'refunded'
       WHEN gs % 30 = 0 THEN 'cancelled'
       ELSE 'completed' END,
  CASE WHEN gs % 10 = 0 THEN 'online' ELSE 'in_store' END,
  '2025-01-01 07:30:00'::timestamptz
    + ((gs / 6) || ' days')::interval
    + ((gs % 600) || ' minutes')::interval
FROM generate_series(1, 960) gs;

-- ── ORDER ITEMS ───────────────────────────────────────────────────────────────

CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity   INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(6,2) NOT NULL,
  subtotal   NUMERIC(8,2) NOT NULL
);

INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
SELECT
  o.id,
  ((o.id * p.rn * 7 + p.rn * 11) % 48) + 1,
  CASE WHEN (o.id + p.rn) % 8 = 0 THEN 2 ELSE 1 END,
  pr.price,
  ROUND((CASE WHEN (o.id + p.rn) % 8 = 0 THEN 2 ELSE 1 END * pr.price)::numeric, 2)
FROM orders o
CROSS JOIN (SELECT generate_series AS rn FROM generate_series(1, 3)) p
JOIN products pr ON pr.id = ((o.id * p.rn * 7 + p.rn * 11) % 48) + 1
WHERE p.rn <= CASE
  WHEN o.id % 6 = 0 THEN 1
  WHEN o.id % 3 = 0 THEN 2
  ELSE 3
END;

-- ── INVENTORY (one row per product, updated weekly) ───────────────────────────

CREATE TABLE inventory (
  id             SERIAL PRIMARY KEY,
  product_id     INT NOT NULL UNIQUE REFERENCES products(id),
  sku            TEXT NOT NULL,                              -- denormalized for quick lookup
  qty_on_hand    INT NOT NULL,
  reorder_point  INT NOT NULL DEFAULT 20,
  reorder_qty    INT NOT NULL DEFAULT 50,
  last_counted   DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id    INT REFERENCES suppliers(id)
);

INSERT INTO inventory (product_id, sku, qty_on_hand, reorder_point, reorder_qty, last_counted, supplier_id)
SELECT
  p.id,
  p.sku,
  CASE
    WHEN p.category_id IN (1,2) THEN 30 + (p.id * 7 % 40)   -- drinks: 30-70 units
    WHEN p.category_id = 4      THEN 15 + (p.id * 5 % 30)   -- bakery: 15-45 units
    WHEN p.category_id = 6      THEN 20 + (p.id * 9 % 50)   -- retail beans: 20-70
    ELSE                              5 + (p.id * 3 % 20)    -- others: 5-25
  END,
  CASE WHEN p.category_id IN (1,2) THEN 15 ELSE 10 END,
  CASE WHEN p.category_id IN (1,2) THEN 60 ELSE 40 END,
  CURRENT_DATE - ((p.id % 7) || ' days')::interval,
  (p.id % 8) + 1
FROM products p;

-- ── PURCHASE ORDERS ───────────────────────────────────────────────────────────

CREATE TABLE purchase_orders (
  id          SERIAL PRIMARY KEY,
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  status      TEXT NOT NULL DEFAULT 'received',
  ordered_at  TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ,
  total_cost  NUMERIC(10,2) NOT NULL DEFAULT 0
);

INSERT INTO purchase_orders (supplier_id, status, ordered_at, received_at, total_cost)
SELECT
  (gs % 8) + 1,
  CASE
    WHEN gs % 20 = 0 THEN 'pending'
    WHEN gs % 10 = 0 THEN 'in_transit'
    ELSE 'received'
  END,
  '2025-01-05'::timestamptz + ((gs * 4) || ' days')::interval,
  CASE
    WHEN gs % 20 != 0 AND gs % 10 != 0
    THEN '2025-01-05'::timestamptz + ((gs * 4 + 3) || ' days')::interval
    ELSE NULL
  END,
  ROUND((150 + (gs * 37 % 800))::numeric, 2)
FROM generate_series(1, 180) gs;

-- ── PURCHASE ORDER ITEMS ──────────────────────────────────────────────────────

CREATE TABLE purchase_order_items (
  id               SERIAL PRIMARY KEY,
  purchase_order_id INT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id       INT NOT NULL REFERENCES products(id),
  quantity         INT NOT NULL,
  unit_cost        NUMERIC(6,2) NOT NULL,
  subtotal         NUMERIC(8,2) NOT NULL
);

INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost, subtotal)
SELECT
  po.id,
  ((po.id * p.rn * 5 + p.rn * 9) % 48) + 1,
  30 + ((po.id * p.rn) % 70),
  pr.cost,
  ROUND(((30 + (po.id * p.rn % 70)) * pr.cost)::numeric, 2)
FROM purchase_orders po
CROSS JOIN (SELECT generate_series AS rn FROM generate_series(1, 3)) p
JOIN products pr ON pr.id = ((po.id * p.rn * 5 + p.rn * 9) % 48) + 1
WHERE p.rn <= CASE
  WHEN po.id % 4 = 0 THEN 1
  WHEN po.id % 2 = 0 THEN 2
  ELSE 3
END;

-- ── SHIPMENTS (deliveries from NJ warehouse to NYC store) ─────────────────────

CREATE TABLE shipments (
  id             SERIAL PRIMARY KEY,
  destination    TEXT NOT NULL DEFAULT 'NYC Store',
  status         TEXT NOT NULL DEFAULT 'delivered',
  shipped_at     TIMESTAMPTZ NOT NULL,
  delivered_at   TIMESTAMPTZ,
  tracking_number TEXT
);

INSERT INTO shipments (destination, status, shipped_at, delivered_at, tracking_number)
SELECT
  'NYC Store',
  CASE WHEN gs % 15 = 0 THEN 'in_transit' ELSE 'delivered' END,
  '2025-01-03'::timestamptz + ((gs * 3) || ' days')::interval,
  CASE
    WHEN gs % 15 != 0
    THEN '2025-01-03'::timestamptz + ((gs * 3 + 1) || ' days')::interval
    ELSE NULL
  END,
  'BB-NJ-' || lpad(gs::text, 6, '0')
FROM generate_series(1, 120) gs;

-- ── SHIPMENT ITEMS ────────────────────────────────────────────────────────────

CREATE TABLE shipment_items (
  id         SERIAL PRIMARY KEY,
  shipment_id INT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  product_id  INT NOT NULL REFERENCES products(id),
  sku         TEXT NOT NULL,
  quantity    INT NOT NULL
);

INSERT INTO shipment_items (shipment_id, product_id, sku, quantity)
SELECT
  s.id,
  ((s.id * p.rn * 6 + p.rn * 8) % 48) + 1,
  pr.sku,
  20 + ((s.id * p.rn) % 50)
FROM shipments s
CROSS JOIN (SELECT generate_series AS rn FROM generate_series(1, 3)) p
JOIN products pr ON pr.id = ((s.id * p.rn * 6 + p.rn * 8) % 48) + 1
WHERE p.rn <= CASE
  WHEN s.id % 3 = 0 THEN 2
  ELSE 3
END;

-- ── SUMMARY ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'waggle_nj seeded:';
  RAISE NOTICE '  categories:          %', (SELECT count(*) FROM categories);
  RAISE NOTICE '  products:            %', (SELECT count(*) FROM products);
  RAISE NOTICE '  suppliers:           %', (SELECT count(*) FROM suppliers);
  RAISE NOTICE '  staff:               %', (SELECT count(*) FROM staff);
  RAISE NOTICE '  customers:           %', (SELECT count(*) FROM customers);
  RAISE NOTICE '  orders:              %', (SELECT count(*) FROM orders);
  RAISE NOTICE '  order_items:         %', (SELECT count(*) FROM order_items);
  RAISE NOTICE '  inventory:           %', (SELECT count(*) FROM inventory);
  RAISE NOTICE '  purchase_orders:     %', (SELECT count(*) FROM purchase_orders);
  RAISE NOTICE '  purchase_order_items:%', (SELECT count(*) FROM purchase_order_items);
  RAISE NOTICE '  shipments:           %', (SELECT count(*) FROM shipments);
  RAISE NOTICE '  shipment_items:      %', (SELECT count(*) FROM shipment_items);
END $$;
