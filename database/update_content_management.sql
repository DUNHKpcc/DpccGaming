CREATE TABLE IF NOT EXISTS content_blog_posts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  summary TEXT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  author VARCHAR(80) NOT NULL DEFAULT 'SunJiaHao',
  status ENUM('draft', 'published') NOT NULL DEFAULT 'published',
  published_at DATE NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_content_blog_posts_status_sort (status, sort_order, published_at),
  KEY idx_content_blog_posts_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS content_docs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_key VARCHAR(120) NOT NULL,
  title VARCHAR(220) NOT NULL,
  tag VARCHAR(80) NOT NULL DEFAULT '其它',
  summary TEXT NULL,
  publisher_name VARCHAR(120) NOT NULL DEFAULT 'dpccgamingSunJiaHao',
  publisher_avatar VARCHAR(500) NOT NULL DEFAULT '/Ai/Sun.jpeg',
  cover_url VARCHAR(500) NOT NULL DEFAULT '',
  file_url VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('draft', 'published') NOT NULL DEFAULT 'published',
  sort_order INT NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_content_docs_key (doc_key),
  KEY idx_content_docs_status_sort (status, sort_order, created_at),
  KEY idx_content_docs_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
