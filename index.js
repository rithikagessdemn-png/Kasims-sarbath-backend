import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import Product from './models/Product.js';
import Video from './models/Video.js';
import Gallery from './models/Gallery.js';
import { createBackup } from './backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://KasimsSarbath:KasimsSarbath123@cluster0.niydpog.mongodb.net/kasims_sarbath';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── BROCHURE UPLOAD SETUP ───────────────────────────────────────────────────
const brochureDir = path.join(__dirname, 'public', 'uploads', 'brochure');
fs.mkdirSync(brochureDir, { recursive: true });

const brochureStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, brochureDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `brochure${ext}`);
  },
});
const brochureUpload = multer({
  storage: brochureStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// Serve brochure uploads as static files
app.use('/uploads/brochure', express.static(brochureDir));

// Initial Default Products to seed if DB is empty
const INITIAL_PRODUCTS = [
  { name: 'Coffee Blast', description: 'Bold. Creamy. Unforgettable.', price: 30, image: '', rating: 4.5, category: 'classic', order: 0 },
  { name: 'Kasims Boba', description: 'Sip. Chew. Smile.', price: 40, image: '', rating: 4.8, category: 'special', order: 1 },
  { name: 'Kasims Combo', description: 'The Perfect Pairing. Full-on Flavor.', price: 35, image: '', rating: 4.2, category: 'classic', order: 2 },
  { name: 'Masala Potato Pops', description: 'Spicy • Tangy • Addictive', price: 45, image: '', rating: 4.7, category: 'premium', order: 3 },
  { name: "Kasim's Power Combo", description: "Hot 'n' Zesty Potatoes with a Cool Beverage Twist", price: 30, image: '', rating: 4.3, category: 'classic', order: 4 },
  { name: 'Khus Sarbath', description: 'Vetiver flavored sarbath with earthy tones', price: 50, image: '', rating: 4.9, category: 'premium', order: 5 },
];

// Seed function
const seedInitialData = async () => {
  try {
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      console.log('🌱 Seeding initial products to MongoDB...');
      await Product.insertMany(INITIAL_PRODUCTS);
      console.log('✅ Initial products seeded successfully');
    }
  } catch (err) {
    console.error('⚠️ Seeding error:', err.message);
  }
};

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log('🍃 Connected to MongoDB Atlas: kasims_sarbath');
    await seedInitialData();
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
  });

// ─── HEALTH & STATS ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/stats', async (req, res) => {
  try {
    const [productsCount, videosCount, galleryCount, products] = await Promise.all([
      Product.countDocuments(),
      Video.countDocuments(),
      Gallery.countDocuments(),
      Product.find().select('price rating category').lean(),
    ]);

    const totalMenuValue = products.reduce((sum, p) => sum + (p.price || 0), 0);
    const avgPrice = products.length ? (totalMenuValue / products.length).toFixed(0) : 0;

    res.json({
      productsCount,
      videosCount,
      galleryCount,
      totalMenuValue,
      avgPrice,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUP ENDPOINTS ────────────────────────────────────────────────────────
app.get('/api/backup', async (req, res) => {
  try {
    const backup = await createBackup();
    res.json({
      success: true,
      message: 'Backup created successfully on server',
      fileName: backup.fileName,
      filePath: backup.filePath,
      data: backup.data,
    });
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

app.get('/api/backup/download', async (req, res) => {
  try {
    const backup = await createBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.fileName}"`);
    res.send(JSON.stringify(backup.data, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to download backup: ' + err.message });
  }
});

// ─── PRODUCTS CRUD ───────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds array is required' });
    }
    const bulkOps = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));
    await Product.bulkWrite(bulkOps);
    const updatedProducts = await Product.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, products: updatedProducts });
  } catch (err) {
    console.error('PUT /api/products/reorder error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, image, rating, category, order } = req.body;
    const parsedRating = parseFloat(rating);
    let resolvedOrder = Number.isFinite(Number(order)) ? Number(order) : null;
    if (resolvedOrder === null) {
      const lastProduct = await Product.findOne().sort({ order: -1 }).select('order').lean();
      resolvedOrder = (lastProduct?.order ?? -1) + 1;
    }
    const newProduct = new Product({
      name,
      description: description || '',
      price: Number(price),
      image: image || '',
      rating: !isNaN(parsedRating) ? Math.min(5, Math.max(1, parsedRating)) : 4.5,
      category: category || 'classic',
      order: resolvedOrder,
    });
    const saved = await newProduct.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/products error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    // Only pick allowed fields — strips _id, __v, createdAt, updatedAt, id virtual
    const { name, description, price, image, rating, category, order } = req.body;
    const parsedRating = parseFloat(rating);
    const updateData = {
      name,
      description: description || '',
      price: Number(price),
      image: image || '',
      rating: !isNaN(parsedRating) ? Math.min(5, Math.max(1, parsedRating)) : 4.5,
      category: category || 'classic',
    };
    if (order !== undefined && Number.isFinite(Number(order))) {
      updateData.order = Number(order);
    }
    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/products error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── VIDEOS CRUD ─────────────────────────────────────────────────────────────
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 }).lean();
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/videos', async (req, res) => {
  try {
    const { title, youtubeUrl, videoUrl, platform, description } = req.body;
    const resolvedUrl = videoUrl || youtubeUrl || '';
    const resolvedPlatform = platform || (resolvedUrl.includes('instagram.com') ? 'instagram' : 'youtube');
    const newVideo = new Video({
      title,
      youtubeUrl: resolvedUrl,
      videoUrl: resolvedUrl,
      platform: resolvedPlatform,
      description: description || '',
    });
    const saved = await newVideo.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/videos/:id', async (req, res) => {
  try {
    const { title, youtubeUrl, videoUrl, platform, description } = req.body;
    const resolvedUrl = videoUrl || youtubeUrl || '';
    const resolvedPlatform = platform || (resolvedUrl.includes('instagram.com') ? 'instagram' : 'youtube');
    const updated = await Video.findByIdAndUpdate(
      req.params.id,
      {
        title,
        youtubeUrl: resolvedUrl,
        videoUrl: resolvedUrl,
        platform: resolvedPlatform,
        description: description || '',
      },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Video not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  try {
    const deleted = await Video.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Video not found' });
    res.json({ message: 'Video deleted successfully', id: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── GALLERY CRUD ────────────────────────────────────────────────────────────
app.get('/api/gallery', async (req, res) => {
  try {
    const gallery = await Gallery.find().sort({ createdAt: -1 }).lean();
    res.json(gallery);
  } catch (err) {
    console.error('❌ Gallery GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/gallery', async (req, res) => {
  try {
    const { title, category, image, caption } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    const newGallery = new Gallery({ title, category, image, caption });
    const saved = await newGallery.save();
    console.log('✅ Gallery image saved:', saved.title || saved._id, '| category:', saved.category);
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Gallery POST error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/gallery/:id', async (req, res) => {
  try {
    const { title, category, image, caption } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }
    const updated = await Gallery.findByIdAndUpdate(
      req.params.id,
      { title, category, image, caption },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Gallery item not found' });
    console.log('✅ Gallery image updated:', updated.title || updated._id);
    res.json(updated);
  } catch (err) {
    console.error('❌ Gallery PUT error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/gallery/:id', async (req, res) => {
  try {
    const deleted = await Gallery.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Gallery item not found' });
    console.log('🗑️ Gallery image deleted:', deleted.title || req.params.id);
    res.json({ message: 'Gallery item deleted successfully', id: req.params.id });
  } catch (err) {
    console.error('❌ Gallery DELETE error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── BROCHURE ENDPOINTS ──────────────────────────────────────────────────────
// GET current brochure info
app.get('/api/brochure', (req, res) => {
  const files = fs.existsSync(brochureDir) ? fs.readdirSync(brochureDir).filter(f => f.endsWith('.pdf')) : [];
  if (files.length === 0) {
    return res.json({ exists: false, url: null, filename: null });
  }
  const filename = files[0];
  res.json({
    exists: true,
    url: `/uploads/brochure/${filename}`,
    filename,
  });
});

// POST upload new brochure (replaces existing)
app.post('/api/brochure', brochureUpload.single('brochure'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF file uploaded' });
  }
  res.json({
    success: true,
    url: `/uploads/brochure/${req.file.filename}`,
    filename: req.file.filename,
    size: req.file.size,
    message: 'Brochure uploaded successfully',
  });
});

// DELETE brochure
app.delete('/api/brochure', (req, res) => {
  try {
    const files = fs.existsSync(brochureDir) ? fs.readdirSync(brochureDir).filter(f => f.endsWith('.pdf')) : [];
    files.forEach(f => fs.unlinkSync(path.join(brochureDir, f)));
    res.json({ success: true, message: 'Brochure deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Kasim's Sarbath API Server running on port ${PORT}`);
  console.log(`   - Health check: http://localhost:${PORT}/api/health`);
  console.log(`   - Backup endpoint: http://localhost:${PORT}/api/backup`);
});
