// server.js
const express = require('express');         
const { Pool } = require('pg');             // Postgres
const formidable = require('formidable');   
const sharp = require('sharp');             
const { put } = require('@vercel/blob');    
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8001;

app.use(cors());
app.use(express.json());

// -------------------- Postgres 연결 --------------------
const db = new Pool({
  connectionString: process.env.DATABASE_URL, // Render Postgres 환경변수
  ssl: {
    rejectUnauthorized: false,               // Render SSL 필요
  },
});

// -------------------- 퀴즈 리스트 조회 --------------------
app.get('/api/quiz/list', async (req, res) => {
  try {
    const tagId = Number(req.query.tag_id ?? 0);
    let sql = 'SELECT * FROM quiz_list';
    const params = [];

    if (tagId !== 0) {
      sql += ' WHERE tag_id = $1';
      params.push(tagId);
    }

    sql += ' ORDER BY quiz_id DESC';
    const { rows } = await db.query(sql, params);
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
    const { rows } = await db.query(
      'SELECT * FROM quiz_list WHERE quiz_id = $1',
      [quizId]
    );
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
    const { rows } = await db.query(
      'SELECT * FROM quiz_content WHERE quiz_id = $1',
      [quizId]
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'DB error' });
  }
});

// -------------------- 퀴즈 추가 --------------------
app.post('/api/quiz/add', async (req, res) => {
  try {
    const { title, description, user_id, tag_id, thumbnail_url, quiz_content } = req.body;

    if (!quiz_content || !Array.isArray(quiz_content) || quiz_content.length === 0) {
      return res.status(400).json({ error: 'invalid_answer' });
    }

    const insertResult = await db.query(
      'INSERT INTO quiz_list (title, description, user_id, tag_id, thumbnail_img_url) VALUES ($1,$2,$3,$4,$5) RETURNING quiz_id',
      [title, description, user_id, tag_id, thumbnail_url || null]
    );
    const insertId = insertResult.rows[0].quiz_id;

    for (let i = 0; i < quiz_content.length; i++) {
      const item = quiz_content[i];
      await db.query(
        `INSERT INTO quiz_content
         (quiz_id, content, type, answer1, answer2, answer3, answer4, answer5, content_img_url, answer_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          insertId,
          item.content,
          item.type,
          item.answer1,
          item.answer2,
          item.answer3,
          item.answer4,
          item.answer5,
          item.content_img_url || null,
          item.answer_number,
        ]
      );
    }

    res.status(200).json({ success: true, quiz_id: insertId });
  } catch (e) {
    console.error('[ERROR] DB insertion failed', e);
    res.status(500).json({ error: 'DB insertion failed' });
  }
});

// -------------------- 서버 시작 --------------------
app.listen(port, () => {
  console.log(`Express server running on port ${port}`);
});
