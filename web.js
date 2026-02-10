// server.js
const express = require('express');          // Express 4.x 호환
const mysql = require('mysql2/promise');     // MySQL2 Promise
const formidable = require('formidable');    // Formidable v3
const sharp = require('sharp');              // 이미지 처리
const { put } = require('@vercel/blob');     // Vercel Blob
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());

// -------------------- MySQL 연결 --------------------
const db = mysql.createPool({
  host: process.env.DB_HOST || 'kjmpp.cafe24app.com',
  user: process.env.DB_USER || 'kjm980810',
  password: process.env.DB_PASSWORD || 'Rlawjdals135!',
  database: process.env.DB_NAME || 'kjm980810',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// -------------------- 퀴즈 리스트 조회 --------------------
app.get('/api/quiz/list', async (req, res) => {
  try {
    const tagId = Number(req.query.tag_id ?? 0);
    let sql = 'SELECT * FROM quiz_list';
    const params = [];

    if (tagId !== 0) {
      sql += ' WHERE tag_id = ?';
      params.push(tagId);
    }

    sql += ' ORDER BY quiz_id DESC';

    const [rows] = await db.query(sql, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 퀴즈 상세 조회 --------------------
app.get('/api/quiz/detail', async (req, res) => {
  try {
    const quizId = req.query.quiz_id;
    const [rows] = await db.query('SELECT * FROM quiz_list WHERE quiz_id = ?', [quizId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 퀴즈 콘텐츠 조회 --------------------
app.get('/api/quiz/content', async (req, res) => {
  try {
    const quizId = req.query.quiz_id;
    const [rows] = await db.query('SELECT * FROM quiz_content WHERE quiz_id = ?', [quizId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 퀴즈 추가 --------------------
const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
};

// server.js
app.post('/api/quiz/add', async (req, res) => {
  try {
    console.log('[1] Receiving quiz payload...');
    const { title, description, user_id, tag_id, thumbnail_url, quiz_content } = req.body;

    if (!quiz_content || !Array.isArray(quiz_content) || quiz_content.length === 0) {
      console.log('[ERROR] quiz_content missing or invalid');
      return res.status(400).json({ error: 'invalid_answer' });
    }

    console.log('[2] Inserting quiz_list into DB...');
    const [insertResult] = await db.query(
      'INSERT INTO quiz_list (title, description, user_id, tag_id, thumbnail_img_url) VALUES (?, ?, ?, ?, ?)',
      [title, description, user_id, tag_id, thumbnail_url || null]
    );
    const insertId = insertResult.insertId;
    console.log('[3] quiz_list inserted, insertId:', insertId);

    console.log('[4] Inserting quiz_content into DB...');
    for (let i = 0; i < quiz_content.length; i++) {
      const item = quiz_content[i];
      await db.query(
        `INSERT INTO quiz_content
         (quiz_id, content, type, answer1, answer2, answer3, answer4, answer5, content_img_url, answer_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          insertId,
          item.content,
          item.type,
          item.answer1,
          item.answer2,
          item.answer3,
          item.answer4,
          item.answer5,
          item.content_img_url || null, // 클라이언트에서 보내준 URL
          item.answer_number,
        ]
      );
      console.log(`[4.${i}] quiz_content ${i} inserted`);
    }

    console.log('[5] All content processed. Sending response...');
    res.status(200).json({ success: true, quiz_id: insertId });

  } catch (e) {
    console.error('[ERROR] DB insertion failed', e);
    res.status(500).json({ error: 'DB insertion failed' });
  }
});




// -------------------- 퀴즈 콘텐츠 조회 --------------------
app.get('/api/quiz/quiz_content', async (req, res) => {
  try {
    const quizId = req.query.quiz_id;
    const [rows] = await db.query(
      'SELECT * FROM quiz_content WHERE quiz_id = ?',
      [quizId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 퀴즈 결과 전송 --------------------
app.post('/api/quiz/quizSend', async (req, res) => {
  try {
    const { adjust_percent, isLogin, login_user_id, quiz_id } = req.body;
    const [rows] = await db.query(
      'INSERT INTO quiz_result (adjust_percent, isLogin, login_user_id, quiz_id) VALUES (?, ?, ?, ?)',
      [adjust_percent, isLogin, login_user_id, quiz_id]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 카카오 로그인 (DB 조회 및 회원가입) --------------------
app.get('/api/auth/get_user', async (req, res) => {
  const kakaoId = req.query.kakaoId;
  const [rows] = await db.query('SELECT user_id, name FROM quiz_user WHERE kakao_id = ?', [kakaoId]);
  res.json(rows[0] || null);
});

app.post('/api/auth/create_user', async (req, res) => {
  const { kakaoId, name } = req.body;
  const [result] = await db.query('INSERT INTO quiz_user (kakao_id, name) VALUES (?, ?)', [kakaoId, name]);
  res.json({ user_id: result.insertId, name });
});

app.post('/api/auth/check_user', async (req, res) => {
  const { kakaoId } = req.body;
  const [rows] = await db.query('SELECT user_id FROM quiz_user WHERE kakao_id = ?', [kakaoId]);
  res.json({ exists: rows.length > 0 });
});


// -------------------- 태그 리스트 조회 --------------------
app.get('/api/quiz/tag_list', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM quiz_tag');
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});


// -------------------- 서버 시작 --------------------
app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});
