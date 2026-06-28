const path = require('path');
const express = require('express');
const {
  dashboardRoutes,
  jobOrderRoutes,
  placeholderRoutes,
} = require('./routes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', dashboardRoutes);
app.use('/job-orders', jobOrderRoutes);
app.use('/', placeholderRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'taig-nope-portal',
    version: 'Operational Awareness',
  });
});

module.exports = app;
