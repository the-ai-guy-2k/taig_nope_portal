'use strict';

/**
 * TAIG Online Music Store — catalog database (SQLite via sql.js, pure JS).
 *
 * The database file lives on the persistent volume (/app/nebula_local) so it
 * survives container rebuilds. On first start it is created and seeded from
 * data/music-store-catalog.json. Tables follow the design doc pack
 * (taig-online-music-design-doc-pack): artists, albums, tracks, products,
 * orders, order_items, download_tokens. Orders / tokens stay empty in the
 * MVP — there is no payment yet, so nothing can be ordered or delivered.
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.MUSIC_STORE_DB
  || path.join(__dirname, '..', '..', 'nebula_local', 'music-store.sqlite');
const SEED_PATH = path.join(__dirname, '..', '..', 'data', 'music-store-catalog.json');

let dbPromise = null;

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function rows(db, sql) {
  const result = db.exec(sql);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

async function openDb() {
  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
    seed(db);
    persist(db);
  }
  return db;
}

function seed(db) {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

  db.run(`CREATE TABLE artists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    roster_position INTEGER,
    blurb TEXT
  )`);
  db.run(`CREATE TABLE albums (
    id INTEGER PRIMARY KEY,
    artist_id INTEGER NOT NULL REFERENCES artists(id),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    release_date TEXT,
    label TEXT,
    cover TEXT,
    price_cents INTEGER NOT NULL,
    cd_price_cents INTEGER NOT NULL,
    status TEXT,
    total_time TEXT,
    track_count INTEGER
  )`);
  db.run(`CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    album_id INTEGER NOT NULL REFERENCES albums(id),
    num INTEGER NOT NULL,
    title TEXT NOT NULL,
    duration TEXT,
    duration_seconds INTEGER,
    preview TEXT,
    demo_available INTEGER NOT NULL DEFAULT 0,
    is_single INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE products (
    id TEXT PRIMARY KEY,
    album_id INTEGER REFERENCES albums(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    detail TEXT,
    price_cents INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    status TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_cents INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE download_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id),
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    downloads_used INTEGER NOT NULL DEFAULT 0,
    downloads_max INTEGER NOT NULL DEFAULT 3
  )`);

  for (const a of seed.artists) {
    db.run(`INSERT INTO artists (id, name, slug, roster_position, blurb)
      VALUES (${a.id}, '${esc(a.name)}', '${esc(a.slug)}', ${a.roster_position}, '${esc(a.blurb)}')`);
  }
  for (const al of seed.albums) {
    db.run(`INSERT INTO albums (id, artist_id, title, slug, release_date, label, cover,
        price_cents, cd_price_cents, status, total_time, track_count)
      VALUES (${al.id}, ${al.artist_id}, '${esc(al.title)}', '${esc(al.slug)}',
        '${esc(al.release_date)}', '${esc(al.label)}', '${esc(al.cover)}',
        ${al.price_cents}, ${al.cd_price_cents}, '${esc(al.status)}',
        '${esc(al.total_time)}', ${al.track_count})`);
  }
  for (const t of seed.tracks) {
    db.run(`INSERT INTO tracks (id, album_id, num, title, duration, duration_seconds,
        preview, demo_available, is_single, price_cents)
      VALUES (${t.id}, ${t.album_id}, ${t.num}, '${esc(t.title)}', '${esc(t.duration)}',
        ${t.duration_seconds}, ${t.preview ? `'${esc(t.preview)}'` : 'NULL'},
        ${t.demo_available ? 1 : 0}, ${t.is_single ? 1 : 0}, ${t.price_cents})`);
  }
  for (const p of seed.products) {
    db.run(`INSERT INTO products (id, album_id, kind, name, detail, price_cents)
      VALUES ('${esc(p.id)}', ${p.album_id}, '${esc(p.kind)}', '${esc(p.name)}',
        '${esc(p.detail)}', ${p.price_cents})`);
  }
}

function persist(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

async function getCatalog() {
  const db = await getDb();
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const artists = rows(db, 'SELECT * FROM artists ORDER BY roster_position');
  const albums = rows(db, 'SELECT * FROM albums ORDER BY id');
  const tracks = rows(db, 'SELECT * FROM tracks ORDER BY album_id, num');
  const products = rows(db, 'SELECT * FROM products ORDER BY id');
  for (const t of tracks) {
    t.demo_available = t.demo_available === 1;
    t.is_single = t.is_single === 1;
  }
  return { store: seed.store, artists, albums, tracks, products };
}

module.exports = { getCatalog, getDb };
