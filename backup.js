import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from './models/Product.js';
import Video from './models/Video.js';
import Gallery from './models/Gallery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://gessdemn:gessdemn@cluster0.niydpog.mongodb.net/kasims_sarbath';

export const createBackup = async () => {
  const isConnected = mongoose.connection.readyState === 1;
  if (!isConnected) {
    await mongoose.connect(MONGODB_URI);
  }

  const [products, videos, gallery] = await Promise.all([
    Product.find().lean(),
    Video.find().lean(),
    Gallery.find().lean(),
  ]);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData = {
    database: 'kasims_sarbath',
    exportedAt: new Date().toISOString(),
    counts: {
      products: products.length,
      videos: videos.length,
      gallery: gallery.length,
    },
    data: {
      products,
      videos,
      gallery,
    },
  };

  const backupFileName = `kasims_sarbath_backup_${timestamp}.json`;
  const backupFilePath = path.join(backupDir, backupFileName);

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');

  console.log(`✅ Backup successfully created at: ${backupFilePath}`);
  console.log(`   - Products: ${products.length}`);
  console.log(`   - Videos: ${videos.length}`);
  console.log(`   - Gallery items: ${gallery.length}`);

  return {
    filePath: backupFilePath,
    fileName: backupFileName,
    data: backupData,
  };
};

// If run directly from terminal
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createBackup()
    .then((result) => {
      console.log(`\n🎉 Backup saved to: ${result.fileName}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backup failed:', err);
      process.exit(1);
    });
}
