-- ShopGuard research seed data

DELETE FROM users WHERE id = 'admin_001';

-- 插入分类
INSERT INTO categories (id, name, parent_id, icon, sort_order) VALUES
('cat_digital', '数码电子', NULL, '📱', 1),
('cat_fashion', '服饰鞋包', NULL, '👔', 2),
('cat_home', '家居生活', NULL, '🏠', 3),
('cat_beauty', '美妆护肤', NULL, '💄', 4),
('cat_food', '食品饮料', NULL, '🍔', 5);

-- 数码电子
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_001', 'cat_digital', 'iPhone 15 Pro Max', '钛金属设计 A17 Pro芯片', '全新钛金属设计，搭载A17 Pro芯片，性能提升40%', 8999, 9999, 50, 1286, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 1, datetime('now'), datetime('now')),
('prod_002', 'cat_digital', 'MacBook Air M3', '轻薄便携 性能强劲', '搭载M3芯片，18小时续航，仅重1.24kg', 7999, 8999, 30, 856, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_003', 'cat_digital', 'AirPods Pro 2', '主动降噪 空间音频', '新一代主动降噪技术，支持空间音频', 1899, 1999, 100, 2341, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_004', 'cat_digital', 'iPad Pro', 'M2芯片 Liquid视网膜屏', '配备M2芯片，专业创作工具', 6999, 7999, 25, 543, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now')),
('prod_005', 'cat_digital', 'Apple Watch S9', '健康监测 智能手表', '全天候健康监测，支持心电图', 2999, 3299, 60, 1124, 4.6, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now'));

-- 服饰鞋包
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_006', 'cat_fashion', 'Nike Air Max 270', '气垫运动鞋 透气舒适', '全掌气垫设计，透气网面', 899, 1299, 80, 2156, 4.5, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_007', 'cat_fashion', 'Adidas外套', '经典款 潮流百搭', '经典三条纹设计，纯棉面料', 599, 799, 120, 1876, 4.6, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_008', 'cat_fashion', 'Converse帆布鞋', '经典高帮 百搭潮流', '经典设计，百搭神器', 359, 459, 200, 3245, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now'));

-- 家居生活
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_009', 'cat_home', '戴森吸尘器', '强劲吸力 智能除螨', '激光探测灰尘，深度清洁', 3999, 4499, 20, 567, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now')),
('prod_010', 'cat_home', '小米空气净化器', '除醛除菌 智能监测', 'H13级HEPA滤芯，除醛率99%', 1499, 1799, 45, 1234, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now'));

-- 美妆护肤
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_011', 'cat_beauty', '雅诗兰黛小棕瓶', '修护精华 抗初老', 'ANR修护科技，熬夜必备', 680, 850, 55, 1876, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_012', 'cat_beauty', '兰蔻粉水', '保湿爽肤水 温和舒缓', '玫瑰精粹，补水保湿', 310, 390, 80, 2345, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now'));

-- 食品饮料
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_013', 'cat_food', '星巴克咖啡豆', '中度烘焙 经典派克', '100%阿拉比卡豆，中度烘焙', 128, 168, 120, 2134, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_014', 'cat_food', '三只松鼠坚果', '每日坚果 营养健康', '混合坚果，独立小包装', 89, 129, 250, 5678, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_015', 'cat_food', '元气森林气泡水', '0糖0脂0卡 健康饮品', '赤藓糖醇代糖，0糖0脂0卡', 55, 69, 500, 8765, 4.6, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now'));
