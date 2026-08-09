-- English product and category display text for language switching

ALTER TABLE categories ADD COLUMN name_en TEXT;
ALTER TABLE products ADD COLUMN name_en TEXT;
ALTER TABLE products ADD COLUMN subtitle_en TEXT;
ALTER TABLE products ADD COLUMN description_en TEXT;

UPDATE categories SET name_en = 'Digital Electronics' WHERE id = 'cat_digital';
UPDATE categories SET name_en = 'Fashion and Bags' WHERE id = 'cat_fashion';
UPDATE categories SET name_en = 'Home and Living' WHERE id = 'cat_home';
UPDATE categories SET name_en = 'Beauty and Skincare' WHERE id = 'cat_beauty';
UPDATE categories SET name_en = 'Food and Beverages' WHERE id = 'cat_food';

UPDATE products
SET name_en = 'iPhone 15 Pro Max',
    subtitle_en = 'Titanium design with A17 Pro chip',
    description_en = 'New titanium design with the A17 Pro chip and up to 40% stronger performance'
WHERE id = 'prod_001';

UPDATE products
SET name_en = 'MacBook Air M3',
    subtitle_en = 'Portable, lightweight, and powerful',
    description_en = 'Powered by the M3 chip with up to 18 hours of battery life and a 1.24 kg body'
WHERE id = 'prod_002';

UPDATE products
SET name_en = 'AirPods Pro 2',
    subtitle_en = 'Active noise cancellation and spatial audio',
    description_en = 'Next-generation active noise cancellation with spatial audio support'
WHERE id = 'prod_003';

UPDATE products
SET name_en = 'iPad Pro',
    subtitle_en = 'M2 chip with Liquid Retina display',
    description_en = 'Equipped with the M2 chip and professional creative tools'
WHERE id = 'prod_004';

UPDATE products
SET name_en = 'Apple Watch S9',
    subtitle_en = 'Health monitoring smartwatch',
    description_en = 'All-day health tracking with ECG support'
WHERE id = 'prod_005';

UPDATE products
SET name_en = 'Nike Air Max 270',
    subtitle_en = 'Breathable cushioned running shoes',
    description_en = 'Full-length air cushioning with a breathable mesh upper'
WHERE id = 'prod_006';

UPDATE products
SET name_en = 'Adidas Jacket',
    subtitle_en = 'Classic and easy to style',
    description_en = 'Classic three-stripe design with cotton fabric'
WHERE id = 'prod_007';

UPDATE products
SET name_en = 'Converse Canvas Sneakers',
    subtitle_en = 'Classic high-top everyday style',
    description_en = 'A timeless design that pairs easily with everyday outfits'
WHERE id = 'prod_008';

UPDATE products
SET name_en = 'Dyson Vacuum Cleaner',
    subtitle_en = 'Powerful suction with smart mite removal',
    description_en = 'Laser dust detection for deeper cleaning'
WHERE id = 'prod_009';

UPDATE products
SET name_en = 'Xiaomi Air Purifier',
    subtitle_en = 'Formaldehyde removal and smart monitoring',
    description_en = 'H13 HEPA filter with 99% formaldehyde removal efficiency'
WHERE id = 'prod_010';

UPDATE products
SET name_en = 'Estee Lauder Advanced Night Repair',
    subtitle_en = 'Repair serum for early aging care',
    description_en = 'ANR repair technology designed for tired, late-night skin'
WHERE id = 'prod_011';

UPDATE products
SET name_en = 'Lancome Tonique Confort',
    subtitle_en = 'Gentle hydrating toner',
    description_en = 'Rose extract formula for hydration and soothing care'
WHERE id = 'prod_012';

UPDATE products
SET name_en = 'Starbucks Coffee Beans',
    subtitle_en = 'Medium roast Pike Place classic',
    description_en = '100% Arabica beans with a medium roast profile'
WHERE id = 'prod_013';

UPDATE products
SET name_en = 'Three Squirrels Mixed Nuts',
    subtitle_en = 'Daily healthy mixed nuts',
    description_en = 'Mixed nuts in individually wrapped daily packs'
WHERE id = 'prod_014';

UPDATE products
SET name_en = 'Genki Forest Sparkling Water',
    subtitle_en = 'Zero sugar, zero fat, zero calories',
    description_en = 'Erythritol-sweetened sparkling drink with zero sugar, fat, and calories'
WHERE id = 'prod_015';
