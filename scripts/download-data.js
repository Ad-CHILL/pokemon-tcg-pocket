const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const unrar = require('node-unrar-js');

const urls = [
  'https://github.com/Ad-CHILL/pokemon-tcg-pocket/releases/download/v1.0.1/data.part1.rar',
  'https://github.com/Ad-CHILL/pokemon-tcg-pocket/releases/download/v1.0.1/data.part2.rar'
];

const expectedHashes = [
  '9eddeb32f149e9692da69d773c34a7fc1d2fb8961de83ffbbfe127ea73118fcc',
  '71846cf3b712b2b7a89d1f18358383cd495750a842a98e3c5b691db1b8e1a27e'
];

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => file.close(resolve));
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

const verifyHash = (filePath, expectedHash) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => {
      const fileHash = hash.digest('hex');
      if (fileHash === expectedHash) resolve(true);
      else reject(new Error(`Hash mismatch! ${fileHash}`));
    });
    stream.on('error', reject);
  });
};

async function main() {
  const tmpDir = path.join(__dirname, '../tmp_data');
  const targetDataDir = path.join(__dirname, '../public/data');

  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!fs.existsSync(targetDataDir)) fs.mkdirSync(targetDataDir, { recursive: true });

  for (let i = 0; i < urls.length; i++) {
    const filePath = path.join(tmpDir, `data.part${i + 1}.rar`);
    console.log(`[Vercel Build] Downloading part ${i + 1}...`);
    await downloadFile(urls[i], filePath);
    
    console.log(`[Vercel Build] Verifying SHA-256 for part ${i + 1}...`);
    await verifyHash(filePath, expectedHashes[i]);
  }

  console.log('[Vercel Build] Extracting RAR files...');
  const part1Path = path.join(tmpDir, 'data.part1.rar');
  const buf = fs.readFileSync(part1Path);
  const extractor = await unrar.createExtractorFromData({ data: buf });
  
  const extracted = extractor.extract({ files: () => true });
  for (const file of extracted.files) {
    if (file.fileHeader.flags.directory) continue;
    const outPath = path.join(targetDataDir, file.fileHeader.name);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, file.extraction);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('[Vercel Build] Data successfully extracted!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});