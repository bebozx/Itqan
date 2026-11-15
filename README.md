# Itqan (إتقان)

A formative assessment platform for schools, inspired by Seneca's question system. Itqan supports daily, low-stakes practice: it helps weaker students retrieve core concepts and pushes stronger students to think beyond the curriculum.

## Features

- **Four roles:** Admin, Subject Supervisor, Teacher, Student
- **Admin:** creates classes and students from a dashboard
- **Teacher:** builds questions and assigns assessments
- **Supervisor:** follows his teachers and tracks student progress
- **Student:** practices assigned assessments with instant feedback
- **Individual differences:** a teacher can assign different assessments to different students of the same class at the same time
- **Seneca-style answer behavior:** a wrong answer stays in place so the student can go back to the book and think again; a correct answer turns green and moves on
- **No pressure by design:** low-stakes points, no leaderboard by default

## Tech Stack

- **Backend:** Node.js (`server/`), with route modules per role, a grading module, and a data layer
- **Frontend:** vanilla JavaScript single-page app (`public/`), with a question editor and question renderer shared across roles
- **Data:** demo data only (see `server/seed.js`)

## Getting Started

Requirements: [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/bebozx/Itqan.git
cd Itqan
npm install
npm start
```

Then open http://localhost:3000

## Demo Accounts

The seed script creates demo users for each role. All data in this repository is fictional and for testing only.

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Supervisor | `m1` | `1234` |
| Teacher | `t1` | `1234` |
| Student | `s1 … s6` | `1234` |

## Project Structure

```
server/
  index.js              App entry point
  db.js                 Data layer
  engine.js             Assessment / session logic
  grade.js              Answer grading
  routes-admin.js       Admin API
  routes-teacher.js     Teacher API
  routes-supervisor.js  Supervisor API
  routes-student.js     Student API
  seed.js               Demo data
public/
  index.html
  css/app.css
  js/                   Per-role views, question editor and renderer
```

## Roadmap

- Adaptive sessions based on each student's mastery
- Spaced retrieval: bring back concepts a student struggled with
- Concept-based mastery tracking per student

## Author

Built by Bahaa ([@bebozx](https://github.com/bebozx)).
