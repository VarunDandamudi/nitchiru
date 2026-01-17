const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const SocraticSession = require('../models/SocraticSession');
const { logger } = require('../utils/logger'); // Assuming logger exists, if not use console

// Helper: Calculate File Hash
const calculateFileHash = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
};

const upload = multer({ dest: 'uploads_temp/' });

const SOCRATIC_SERVICE_URL = process.env.SOCRATIC_SERVICE_URL || 'http://localhost:2002';

// 1. Upload & Create/Append Session
router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded." });

    const userId = req.user?._id;
    const sessionId = req.body.sessionId;
    const filePath = req.file.path;

    if (!userId) {
        fs.unlink(filePath, () => { });
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const fileHash = await calculateFileHash(filePath);
        let session;

        if (sessionId) {
            // Append to existing session
            session = await SocraticSession.findOne({ _id: sessionId, userId });
            if (!session) {
                fs.unlink(filePath, () => { });
                return res.status(404).json({ message: "Session not found" });
            }

            // Check duplications by hash
            if (!session.fileHashes.includes(fileHash)) {
                session.fileHashes.push(fileHash);
                session.filenames.push(req.file.originalname);
                session.messages.push({
                    role: 'assistant',
                    content: `I've added **${req.file.originalname}** to our context. Ask away!`
                });
                await session.save();
            } else {
                session.messages.push({
                    role: 'assistant',
                    content: `I already have **${req.file.originalname}** in my context.`
                });
                await session.save();
            }

        } else {
            // Create New Session
            session = await SocraticSession.create({
                userId,
                fileHashes: [fileHash],
                filenames: [req.file.originalname],
                messages: [{
                    role: 'assistant',
                    content: `I'm ready to discuss **${req.file.originalname}** with you.`
                }]
            });
        }

        // Send to Python Service (Ingest)
        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath), req.file.originalname);
        formData.append('file_hash', fileHash);

        try {
            const pyResponse = await axios.post(`${SOCRATIC_SERVICE_URL}/ingest`, formData, {
                headers: { ...formData.getHeaders() }
            });

            // --- Capture Summary ---
            if (pyResponse.data.summary) {
                console.log("[SocraticRoute] Received Summary from Python:", pyResponse.data.summary.substring(0, 50) + "...");
                // Add the summary as a detailed Assistant message
                session.messages.push({
                    role: 'assistant',
                    content: `### Document Review\n${pyResponse.data.summary}`
                });
                await session.save();
            } else {
                console.log("[SocraticRoute] No summary in Python response.");
            }
        } catch (pyErr) {
            logger.error(`Socratic Ingest Error: ${pyErr.message}`);
        }

        fs.unlink(filePath, () => { }); // Cleanup
        res.status(200).json({ sessionId: session._id, message: "File processed", cached: false });

    } catch (error) {
        fs.unlink(filePath, () => { });
        logger.error(`Upload Error: ${error.message}`);
        res.status(500).json({ message: error.message });
    }
});

// 2. Chat
router.post('/chat', async (req, res) => {
    const { message, sessionId } = req.body;
    const userId = req.user?._id;

    if (!message || !sessionId) return res.status(400).json({ message: "Missing fields" });

    try {
        const session = await SocraticSession.findOne({ _id: sessionId, userId });
        if (!session) return res.status(404).json({ message: "Session not found" });

        // Save User Message
        session.messages.push({ role: 'user', content: message });
        await session.save();

        // Call Python
        const historyForPy = session.messages.map(m => ({ role: m.role, content: m.content }));

        const pyRes = await axios.post(`${SOCRATIC_SERVICE_URL}/chat`, {
            query: message,
            file_hashes: session.fileHashes, // Pass ALL hashes
            history: historyForPy
        });

        const assistantResponse = pyRes.data.response;

        // Save Assistant Message
        session.messages.push({ role: 'assistant', content: assistantResponse });
        await session.save();

        res.json({ response: assistantResponse });

    } catch (error) {
        logger.error(`Chat Error: ${error.message}`);
        const status = error.response?.status || 500;
        const msg = error.response?.data?.error || error.message;
        res.status(status).json({ message: msg });
    }
});

// 3. Get Sessions List
router.get('/sessions', async (req, res) => {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    try {
        const sessions = await SocraticSession.find({ userId })
            .sort({ updatedAt: -1 })
            .select('filenames updatedAt createdAt');

        // Map for frontend compatibility
        const formatted = sessions.map(s => ({
            _id: s._id,
            // Show main file + count if multiple
            filename: s.filenames && s.filenames.length > 0
                ? (s.filenames.length > 1 ? `${s.filenames[0]} + ${s.filenames.length - 1} more` : s.filenames[0])
                : "Untitled Session",
            filenames: s.filenames,
            updatedAt: s.updatedAt,
            createdAt: s.createdAt
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4. Get History
router.get('/history/:sessionId', async (req, res) => {
    const userId = req.user?._id;
    try {
        const session = await SocraticSession.findOne({ _id: req.params.sessionId, userId });
        if (!session) return res.status(404).json({ message: "Session not found" });
        res.json(session);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 5. Delete Session
router.delete('/history/:sessionId', async (req, res) => {
    const userId = req.user?._id;
    try {
        const result = await SocraticSession.deleteOne({ _id: req.params.sessionId, userId });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Session not found" });
        res.json({ message: "Session deleted" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
