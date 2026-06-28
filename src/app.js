const path = require('path');
const express = require('express');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('index', {
    title: 'NOPE Lite',
    portalName: 'TAIG NOPE Portal',
    version: 'MVP Foundation',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'taig-nope-portal',
    version: 'MVP Foundation',
  });
});

module.exports = app;
