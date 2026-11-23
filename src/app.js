const path = require('path');
const express = require('express');
const {
  dashboardRoutes,
  giggitRoutes,
  jobOrderRoutes,
  lucianJobConnectRoutes,
  musicStoreRoutes,
  placeholderRoutes,
  planningRoutes,
  sportsReportRoutes,
} = require('./routes');
const { recordEvent } = require('./services/musicStoreDb');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

/* Music store pageviews, server-side: counts the two storefront pages
   (landing + album) before static serves them. Scoped to exactly those
   paths — nothing else on the portal is counted. Fire-and-forget: a stats
   failure must never slow or break a page load. */
app.use((req, res, next) => {
  const p = req.path;
  if (p === '/music-store/' || p === '/music-store/album/' || p === '/music-store/album') {
    const page = p.indexOf('/album') !== -1 ? 'album' : 'landing';
    recordEvent(req, 'pageview', '', page).catch(() => {});
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json({ limit: '10mb' })); /* Lucian Job Connect resumes arrive as base64 in JSON. */
app.use(express.urlencoded({ extended: true }));

app.use('/', dashboardRoutes);
app.use('/job-orders', jobOrderRoutes);
app.use('/', giggitRoutes);
app.use('/', lucianJobConnectRoutes);
app.use('/', musicStoreRoutes);
app.use('/', sportsReportRoutes);
app.use('/', placeholderRoutes);
app.use('/', planningRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'taig-nope-portal',
    version: 'Docker Foundation (ACI-008)',
  });
});

module.exports = app;
