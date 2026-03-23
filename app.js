const express = require('express');
const serveIndex = require('serve-index');
const { engine } = require('express-handlebars');
const path = require('path');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const { renderPage, getPort, getFormattedDate, renderVideoPage, renderVideoStreamPage, renderVideoScreenshotPage, renderVideoCapturePage, renderVideoPageX11 } = require('./engine');
const { listProjects, generateAssets, renderVideo, generateChapters } = require('./veogen');

// App config from .env file
require('dotenv').config();

const app = express();

// Set Handlebars as the view engine
app.engine('handlebars', engine({
  // add your “sections” directory, or whatever you like
  partialsDir: [
    path.join(__dirname, 'views', 'partials'),   // default
    path.join(__dirname, 'views', 'sections'),   // your extra folder
  ],
  helpers: require('./handlebars-helpers'),
}));
app.set('view engine', 'handlebars');

// Static data
app.use(express.static(path.join(__dirname, 'assets')));
app.use('/projects', express.static(path.join(__dirname, 'veogen', 'projects')));
app.use('/export', express.static(path.join(__dirname, 'export')), serveIndex(path.join(__dirname, 'export'), {'icons': true}));
// Parse JSON bodies
app.use(bodyParser.json({ limit: '50mb' }));

// Routes
app.get('/', (req, res) => {
  res.render('home', {
    title: 'AFIEther - Media',
    version: process.env.npm_package_version,
  });
});

app.post('/veogen', (req, res) => {
  res.render('veogen', { 
    layout: "veogen",
    ...req.body,
  });
});

app.post('/veogen-intro', (req, res) => {
  res.render('veogen-intro', { 
    layout: "veogen-intro",
    ...req.body,
  });
});

app.post('/veogen-outro', (req, res) => {
  res.render('veogen-outro', { 
    layout: "veogen-outro",
    ...req.body,
  });
});

app.post('/veogen/:page', (req, res) => {
  const page = req.params.page;  
  res.render(`veogen-${page}`, { 
    layout: `veogen-${page}`,
    ...req.body,
  });
});

app.post('/renderPage', async (req, res) => {
  const body = req.body;

  const url = body.url;
  const data = body.data;

  const formattedDate = getFormattedDate();
  const fileName = `${formattedDate}.png`;

  const filePath = path.join(__dirname, 'export', `${formattedDate}.png`);

  await renderPage(url, data, filePath);

  res.json({
    fileName,
  })
});

let dataIndex = 0;
const dataCache = {};

app.post('/renderVideoPage', async (req, res) => {
  const body = req.body;

  const url = body.url;
  const data = body.data;

  dataCache[dataIndex++] = data;

  const formattedDate = getFormattedDate();
  // MP4 conversation is done internally in the renderVideoPage function, so we can just name the file as MP4 here
  const fileName = `${formattedDate}.mp4`;

  const filePath = path.join(__dirname, 'export', fileName);

  await renderVideoPageX11(url, data, dataIndex - 1, filePath);

  res.json({
    fileName,
  })
});

app.get('/veogenRaw/:page', async (req, res) => {
  // const body = req.query.data ? JSON.parse(req.query.data) : {};
  const dataIndex = req.query.dataIndex ? parseInt(req.query.dataIndex) : 0;
  const body = dataCache[dataIndex];

  const page = req.params.page;  
  res.render(`veogen-${page}`, { 
    layout: `veogen-${page}`,
    ...body,
  });
});

app.get('/genQR/:url', async (req, res) => {
  const url = req.params.url;
  const base64 = await QRCode.toDataURL(url, {
    //width: 300,
    scale:10,
  });
  
  res.json({
    base64,
  })
});

app.get('/veogen', (req, res) => {
  const projects = listProjects();

  res.json({
    veogenProjects: projects,
  });
});

app.post('/veogen/generateAssets/:projectName', async (req, res) => {
  const projects = listProjects();
  const projectName = req.params.projectName;

  if (projects.findIndex(p => p === projectName) < 0) {
    res.status(404);
    return;
  }

  const result = await generateAssets(projectName, `http://localhost:${getPort()}`);

  res.json({
    result
  });
});

app.post('/veogen/renderVideo/:projectName', async (req, res) => {
  const projects = listProjects();
  const projectName = req.params.projectName;

  if (projects.findIndex(p => p === projectName) < 0) {
    res.status(404);
    return;
  }

  const result = await renderVideo(projectName);

  res.json({
    result
  });
});

app.post('/veogen/generateChapters/:projectName', async (req, res) => {
  const projects = listProjects();
  const projectName = req.params.projectName;

  if (projects.findIndex(p => p === projectName) < 0) {
    res.status(404);
    return;
  }

  const result = await generateChapters(projectName);

  res.json({
    result
  });
});

// Start the server
const PORT = getPort();
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

