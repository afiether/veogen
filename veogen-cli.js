const { generateYmlSlide } = require('./veogen/modules/vertex')
const { marked } = require('marked');   
const fs = require('fs');

const prompt = fs.readFileSync('prompt.txt');  

(async () => {
  try {
    const ymlSlide = await generateYmlSlide(prompt);
    const htmlContent = marked(ymlSlide);
    const outputFile = 'output-vertex.html'

    // Write to an HTML file
    fs.writeFileSync(outputFile, htmlContent, 'utf8');
    console.log(`Markdown converted to HTML and saved as ${outputFile}`);  
    // console.log(ymlSlide);
  } catch (err) {
    console.error(err);
  }
})();