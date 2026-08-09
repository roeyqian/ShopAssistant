-- Add more products to enrich the catalog

-- 食品饮料（补充）
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_016', 'cat_food', '哈根达斯冰淇淋', '比利时巧克力 香浓顺滑', '比利时进口巧克力，香浓醇厚', 68, 88, 180, 3421, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_017', 'cat_food', '好利来蛋糕', '经典提拉米苏 甜蜜时刻', '意式提拉米苏，现做现卖', 158, 198, 90, 1567, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now')),
('prod_018', 'cat_food', '百草味零食大礼包', '网红零食 种类丰富', '30+种零食，满足味蕾', 169, 229, 150, 4234, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now'));

-- 数码电子（补充）
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_019', 'cat_digital', 'Sony WH-1000XM5', '旗舰降噪耳机 音质卓越', '业界领先降噪技术，LDAC高解析音质', 2399, 2699, 40, 876, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 1, datetime('now'), datetime('now')),
('prod_020', 'cat_digital', 'GoPro Hero 12', '运动相机 5.3K视频', '防水防抖，极限运动必备', 3299, 3799, 30, 432, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now')),
('prod_021', 'cat_digital', '小米13 Ultra', '徕卡影像 骁龙8 Gen2', '专业影像系统，徕卡调色', 5999, 6499, 55, 1654, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_022', 'cat_digital', 'Kindle Paperwhite', '电子书阅读器 护眼屏幕', '300 PPI高清屏，IPX8防水', 998, 1298, 75, 2345, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now'));

-- 服饰鞋包（补充）
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_023', 'cat_fashion', 'Levi''s经典牛仔裤', '501原色 经典直筒', '经典501版型，原色丹宁布', 499, 699, 100, 2876, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_024', 'cat_fashion', 'Uniqlo羽绒服', '轻薄保暖 防风防水', '90%白鸭绒填充，轻盈保暖', 599, 799, 130, 3456, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_025', 'cat_fashion', 'The North Face冲锋衣', '专业户外 防水透气', 'Gore-Tex面料，三合一设计', 1899, 2299, 60, 1234, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now')),
('prod_026', 'cat_fashion', 'New Balance 574', '复古跑鞋 舒适百搭', '经典复古设计，ENCAP中底科技', 699, 899, 95, 1987, 4.6, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_027', 'cat_fashion', 'Coach手提包', '轻奢品牌 时尚百搭', '真皮材质，经典LOGO设计', 2199, 2799, 35, 765, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now'));

-- 家居生活（补充）
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_028', 'cat_home', '九阳破壁机', '多功能料理 静音设计', '8叶精钢刀，38000转/分钟', 899, 1199, 50, 1876, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_029', 'cat_home', 'MUJI香薰机', '日式简约 助眠放松', '超声波雾化，定时功能', 299, 399, 80, 2345, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_030', 'cat_home', 'Nespresso咖啡机', '胶囊咖啡 一键萃取', '19Bar高压萃取，意式浓缩', 1899, 2299, 40, 987, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 1, datetime('now'), datetime('now')),
('prod_031', 'cat_home', '美的电饭煲', 'IH加热 智能预约', 'IH立体加热，24小时预约', 599, 799, 70, 3456, 4.6, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_032', 'cat_home', 'iRobot扫地机器人', '智能导航 自动回充', 'vSLAM视觉导航，全屋清扫', 2799, 3299, 30, 654, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 1, datetime('now'), datetime('now'));

-- 美妆护肤（补充）
INSERT INTO products (id, category_id, name, subtitle, description, price, original_price, stock, sales_count, rating, image_url, images_json, specs_json, tags_json, is_hot, is_new, created_at, updated_at) VALUES
('prod_033', 'cat_beauty', 'SK-II神仙水', '明星单品 改善肤质', 'Pitera™精华，平衡肌肤', 1280, 1590, 40, 1456, 4.9, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_034', 'cat_beauty', '资生堂红腰子', '抗老精华 紧致提拉', '4MSK技术，淡化细纹', 890, 1080, 50, 1678, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_035', 'cat_beauty', 'MAC口红', '经典子弹头 显色持久', 'Chili色号，气场女王色', 190, 230, 150, 4567, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now')),
('prod_036', 'cat_beauty', '科颜氏高保湿面霜', '深层补水 长效锁水', '冰河糖蛋白，24小时保湿', 420, 520, 90, 2345, 4.8, 'https://via.placeholder.com/400', '[]', '{}', '[]', 0, 0, datetime('now'), datetime('now')),
('prod_037', 'cat_beauty', '欧莱雅小金管', '修复面膜 急救补水', '玻尿酸+烟酰胺，即时水光', 168, 218, 200, 5678, 4.7, 'https://via.placeholder.com/400', '[]', '{}', '[]', 1, 0, datetime('now'), datetime('now'));
