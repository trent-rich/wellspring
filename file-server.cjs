/**
 * Local File Server for Wellspring
 *
 * Provides API endpoints for local file operations:
 * - Reading files (for email attachments)
 * - Listing directory contents
 * - Converting Word docs to PDF (via Microsoft Word AppleScript)
 *
 * Run with: node file-server.js
 * Runs on port 3002 by default
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

const app = express();
const PORT = 3002;

// CORS for local development
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000'],
}));

app.use(express.json());

// Allowed base paths for security
const ALLOWED_PATHS = [
  '/Users/trentmcfadyen/Documents/Project InnerSpace/Watershed/email-ghostwriter/contracts',
  '/Users/trentmcfadyen/Documents/Project InnerSpace/Watershed',
];

function isPathAllowed(filePath) {
  const normalizedPath = path.normalize(filePath);
  return ALLOWED_PATHS.some(allowed => normalizedPath.startsWith(allowed));
}

// Read file as base64
app.get('/api/files/read', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath || !isPathAllowed(filePath)) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Determine MIME type
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
    };

    res.json({
      success: true,
      data: base64Data,
      mimeType: mimeTypes[ext] || 'application/octet-stream',
      filename: path.basename(filePath),
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// List directory contents
app.get('/api/files/list', async (req, res) => {
  try {
    const dirPath = req.query.path;

    if (!dirPath || !isPathAllowed(dirPath)) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }

    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: 'Directory not found' });
    }

    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = items
      .filter(item => !item.name.startsWith('.') && !item.name.startsWith('~$'))
      .map(item => ({
        name: item.name,
        path: path.join(dirPath, item.name),
        isDirectory: item.isDirectory(),
        type: item.isDirectory() ? 'directory' : path.extname(item.name).slice(1),
      }));

    res.json({ success: true, files });
  } catch (error) {
    console.error('Error listing directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search for contract files
app.get('/api/contracts/search', async (req, res) => {
  try {
    const { authorName, stateAbbrev, chapterTitle } = req.query;

    if (!authorName || !stateAbbrev) {
      return res.status(400).json({ error: 'Missing required parameters: authorName, stateAbbrev' });
    }

    const basePath = '/Users/trentmcfadyen/Documents/Project InnerSpace/Watershed/email-ghostwriter/contracts';
    const signatureReadyPath = path.join(basePath, 'GEODE Signature Ready Contracts');

    // Get author initials
    const initials = authorName
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase())
      .join('');

    const result = {
      found: false,
      wordDoc: null,
      pdf: null,
      signatureReadyPdf: null,
    };

    // Search in base directory for Word docs
    if (fs.existsSync(basePath)) {
      const baseFiles = fs.readdirSync(basePath);
      for (const file of baseFiles) {
        if (file.includes(stateAbbrev) && file.includes(initials)) {
          const filePath = path.join(basePath, file);
          if (file.endsWith('.docx') && !file.startsWith('~$')) {
            result.wordDoc = { filename: file, path: filePath, type: 'docx' };
            result.found = true;
          } else if (file.endsWith('.pdf')) {
            result.pdf = { filename: file, path: filePath, type: 'pdf' };
            result.found = true;
          }
        }
      }
    }

    // Search in signature-ready directory for PDFs
    if (fs.existsSync(signatureReadyPath)) {
      const signatureFiles = fs.readdirSync(signatureReadyPath);
      for (const file of signatureFiles) {
        if (file.includes(stateAbbrev) && file.includes(initials) && file.endsWith('.pdf')) {
          const filePath = path.join(signatureReadyPath, file);
          result.signatureReadyPdf = { filename: file, path: filePath, type: 'pdf', isSignatureReady: true };
          result.found = true;
        }
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error searching for contracts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Convert Word doc to PDF using Microsoft Word
app.post('/api/contracts/convert-to-pdf', async (req, res) => {
  try {
    const { wordDocPath, outputPdfPath } = req.body;

    if (!wordDocPath || !isPathAllowed(wordDocPath)) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }

    if (!fs.existsSync(wordDocPath)) {
      return res.status(404).json({ error: 'Word document not found' });
    }

    // Default output path
    const pdfPath = outputPdfPath || wordDocPath.replace(/\.docx?$/i, '.pdf');

    // AppleScript to convert using Microsoft Word
    const appleScript = `
      tell application "Microsoft Word"
        activate
        open POSIX file "${wordDocPath}"
        delay 2
        set theDoc to active document
        save as theDoc file name "${pdfPath}" file format format PDF
        delay 1
        close theDoc saving no
      end tell
    `;

    console.log('Converting Word doc to PDF:', wordDocPath, '->', pdfPath);

    // Execute AppleScript
    const { stdout, stderr } = await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`);

    if (stderr) {
      console.warn('AppleScript stderr:', stderr);
    }

    // Verify PDF was created
    if (fs.existsSync(pdfPath)) {
      res.json({
        success: true,
        pdfPath,
        message: 'PDF created successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'PDF file was not created',
      });
    }
  } catch (error) {
    console.error('Error converting to PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Move file to signature-ready folder
app.post('/api/contracts/move-to-signature-ready', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath || !isPathAllowed(filePath)) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const basePath = '/Users/trentmcfadyen/Documents/Project InnerSpace/Watershed/email-ghostwriter/contracts';
    const signatureReadyPath = path.join(basePath, 'GEODE Signature Ready Contracts');

    // Ensure signature-ready folder exists
    if (!fs.existsSync(signatureReadyPath)) {
      fs.mkdirSync(signatureReadyPath, { recursive: true });
    }

    const filename = path.basename(filePath);
    const destPath = path.join(signatureReadyPath, filename);

    // Copy file (not move, to keep original)
    fs.copyFileSync(filePath, destPath);

    res.json({
      success: true,
      originalPath: filePath,
      newPath: destPath,
    });
  } catch (error) {
    console.error('Error moving file:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`📁 Wellspring File Server running on http://localhost:${PORT}`);
  console.log('Allowed paths:', ALLOWED_PATHS);
});
