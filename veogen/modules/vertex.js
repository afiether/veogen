const axios = require('axios');
const { marked } = require('marked');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = fs.readFileSync(path.join(__dirname, 'vertex-api-key.txt'));

async function generateArticle(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const requestData = {
    system_instruction: {
      parts:[
        // { "text": "You are a blogger. You can write from the first person perspective, bringing personal experiences to the table. Use some emotions in your generation. Use common language, not fancy words. Be simple and concise! Don't be arrogant like a prick!"}
        { "text": "You are a blogger."},
        { "text": "Write from the first person perspective, aiming to emphasise personal experiences. Use emotions, but don't be arrogant as well."},
        // { "text": "Use emotions, don't be dull and boring like a machine."},
        { "text": "Do not start with Okay, buckle up, . "},
        { "text": "Do not use the word buttercup. "},
        { "text": "Be real and focused. "},
        { "text": "Don't start with Ugh. "},
        { "text": "Don't start with Oh. "},
        { "text": "Don't use the term suck. "},
        { "text": "Start with an engaging sentence related to the title I give you. This should include long-tail keywords from this title."},
        { "text": "Do not use comma before 'and' and 'or'. "},
        { "text": "When you encounter a line without ending with dot . use it as a title"},
        { "text": "When you encounter a dash - use it as a list"},
        { "text": "Titles should be output as H2 HTML equivalent"},
        { "text": "Capitalize only the first word in a title"},
      ]
    },
    contents: [
      // {
      //   //role: "system",
      //   parts: [{ text: "You are me as a blogger. You can write from the first person perspective, bringing personal experiences to the table. Don't use a too fancy language or too far off expressions." }]
      // },
      {
        parts: [
          { 
            // text: "Write me an article about '8 High income skills to get past the looming 2025 crisis'" 
            text: `${prompt}`,
          }
        ]
      }],
      generationConfig: {
        // stopSequences: [
        //     "Title"
        // ],
        temperature: 1.8,
        maxOutputTokens: 3200,
        topP: 0.8,
        topK: 10
      }
  };

  const response = await axios.post(url, requestData, {
    headers: { 'Content-Type': 'application/json' }
  });

  const markdownText = response.data.candidates[0].content.parts[0].text;
  const htmlContent = marked(markdownText);

  return htmlContent;
}

async function textToSpeech(text) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GEMINI_API_KEY}`;

  // Liked voices
  // en-US-Chirp3-HD-Enceladus
  // en-US-Chirp3-HD-Rasalgethi
  // en-US-Chirp3-HD-Sadaltager
  // -- --- Zubenelgenubi

  const requestBody = {
    input: { text: text },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Chirp3-HD-Sadaltager',
      ssmlGender: 'MALE'
    },
    audioConfig: { audioEncoding: 'MP3' }
  };

  const response = await axios.post(url, requestBody);

  const audioContent = response.data.audioContent;

  return audioContent;
}

async function generateYmlSlide(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const requestData = {
    system_instruction: {
      parts:[
        { "text": "You are a narrator and you help me generate YML slide for my rendering engine."},
        { "text": "A slide is composed of multiple fragments, title and renderType."},
        { "text": `
A fragment can contain the below properties:
1. text: text which will be rendered on the screen
2. ulist: an unordered list HTML equivalent. In output YML, it should be an array
3. olist: an ordered list HTML equivalent. In output YML, it should be an array
4. showcaseImage: one image which will be rendered in the slide. When we have a showcaseImage, then the other properties including subtitle should be null
5. subtite: an H2 heading
6. textToSpeech: the text the narrator will use to present the slide
          `},
        { "text": `
Sample slide YML output:
- title: About me
  renderType: default
  fragments:
    - subtitle: Let's speak
      text: Good to have you here
      ulist:
        - Item 1
        - Item 2
      olist:
      - Item 3
      - Item 4
      textToSpeech: Welcome to my webinar. My name is Gibi.
          `},
        { "text": `
When I ask you to generate a slide from text you will do the following:
- Generate a meaningful title for the slide. Remember you are generating just one slide with multiple fragments.
- Generate as many fragments as necessary depending on the section titles present in the input
- Each fragment should have a subtitle except for the situation when we have showcaseImage. title would appear only once in your output.
- Generate for each fragment text, ulist, olist depending on the input. You can have text and olist or ulist but never olist and ulist in the same fragment
- Around every 2-3 fragments generate a showcaseImage name (generally will be .png)
- each fragment needs to have textToSpeech which is a narrated text speaking about the content of the fragment (text, ulist, olist)
Output needs to be in YML format
          `},
        { "text": `
Moreover, you can notice that there are texts and lists which can be synced with the narration text. For instance:
- subtitle: Financial impact of team-work
  text: In our modern times, it's no longer about basic survival.
  textToSpeech: |
    It's true that nowadays we are no longer at the edge of survival. Still, when you go to buy food and other stuff just remember that someone worked for your shoppings.
- subtitle: Financial impact of team-work
  textAppend: ' '
  ulistAppend:
    - A farmer woked early to plant the seeds
  textToSpeech: |
    Someone worked in the early morning to plant the seeds for the crops. These crops don't grow overnight, so 
- subtitle: Financial impact of team-work
  textAppend: ' '
  ulistAppend:
    - The farmer harvested the crops
  textToSpeech: |
    he needed to water the crops and when the time was due, he harvested them all. 
- subtitle: Financial impact of team-work
  textAppend: ' '
  ulistAppend:
    - The crop was sold for packaging
  textToSpeech: |
    Then the fresh crop was sold for packaging at a company or even directly to the store.
- subtitle: Financial impact of team-work
  textAppend: ' '
  ulistAppend:
    - Product was placed in the shelf
  textToSpeech: |
    Afterwards, the shop employee placed the product on the shelf. 
- subtitle: Financial impact of team-work
  textAppend: ' '
  ulistAppend:
    - The fresh product is picked up by you
  textToSpeech: |
    And finally, you entered the stored and bought the product. Just think about the fact that you have to work as well and you cannot produce yourself this product. Not because it's impossible, but because you wouldn't have time!

    In the sample above, you can note that we reused text from the first fragment by adding textAppend: ' ' 
    We also used ulistAppend to start a list and add items to it at each fragment. Also the textToSpeech is speaking about the item added. Same goes for olist, it supports olistAppend.
    So please split the fragment generation whenever you are given the opportunity since it helps to generate a much more interactive slide.
    textAppend can also be used for longer text. You can add one or more sentence to the last fragment that has text (text YML property). This ensures that the user will see the info gradually. Of course, text to speech needs to be adapted accordingly to speak about the added text in textAppend.
    textAppend also supports HTML, you may add <br /> to go to a new line for different logical constructions.
          `},
        { "text": `
You can also use emojis from time to time. If one fragment element has a showcaseImage, then also add noTitle: true and set the subtitle to null because the text might not look good on the image. A showcaseImage fragment should nevertheless have the textToSpeech element so make sure to add something, be creative.
          `},
        { "text": `
Do not add comma before 'and' and 'or' in any text!
          `},
      ]
    },
    contents: [
      // {
      //   //role: "system",
      //   parts: [{ text: "You are me as a blogger. You can write from the first person perspective, bringing personal experiences to the table. Don't use a too fancy language or too far off expressions." }]
      // },
      {
        parts: [
          { 
            // text: "Write me an article about '8 High income skills to get past the looming 2025 crisis'" 
            text: `${prompt}`,
          }
        ]
      }],
      generationConfig: {
        // stopSequences: [
        //     "Title"
        // ],
        temperature: 1.8,
        maxOutputTokens: 3200,
        topP: 0.8,
        topK: 10
      }
  };

  const response = await axios.post(url, requestData, {
    headers: { 'Content-Type': 'application/json' }
  });

  const markdownText = response.data.candidates[0].content.parts[0].text;
  const htmlContent = marked(markdownText);

  return htmlContent;
}

module.exports = {
  generateArticle,
  generateYmlSlide,
  textToSpeech,
};