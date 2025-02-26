// Pharmacy Voice AI - Phase 1 Implementation
// This system handles automated call routing and basic prescription refills
// Built with Twilio and OpenAI

// ------ SERVER SETUP ------
const express = require('express');
const { urlencoded } = require('body-parser');
const { OpenAI } = require('openai');
const twilio = require('twilio');
const axios = require('axios');

// Initialize Express app
const app = express();
app.use(urlencoded({ extended: false }));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ------ CONFIGURATION ------
// Store hours and common information
const PHARMACY_INFO = {
  name: "Community Health Pharmacy",
  hours: "Monday to Friday: 9am to 7pm, Saturday: 9am to 5pm, Sunday: Closed",
  address: "123 Main Street, Anytown, USA",
  phone: "(555) 123-4567"
};

// Placeholder for Liberty Software RXQ integration
const LIBERTY_API = {
  baseUrl: "https://api.libertysoftware.com", // Replace with actual API endpoint
  apiKey: process.env.LIBERTY_API_KEY
};

// ------ MAIN CALL HANDLER ------
app.post('/incoming-call', async (req, res) => {
  // Create a Twilio VoiceResponse object
  const twiml = new twilio.twiml.VoiceResponse();

  // Greet the caller
  twiml.say({
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, `Welcome to ${PHARMACY_INFO.name}. This call may be recorded for quality and training purposes.`);

  // Start the main menu
  twiml.redirect('/main-menu');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ MAIN MENU ------
app.post('/main-menu', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.gather({
    input: 'speech dtmf',
    timeout: 3,
    speechTimeout: 'auto',
    action: '/process-main-menu',
    speechModel: 'phone_call'
  }).say({
    voice: 'Polly.Joanna'
  }, 'For prescription refills, say "refill" or press 1. For store hours and information, say "information" or press 2. To speak with a pharmacist, say "pharmacist" or press 0.');

  // If no input is received, retry
  twiml.redirect('/main-menu');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ PROCESS MAIN MENU CHOICE ------
app.post('/process-main-menu', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult ? req.body.SpeechResult.toLowerCase() : null;
  const digits = req.body.Digits;

  // Route based on input
  if (input?.includes('refill') || digits === '1') {
    twiml.redirect('/prescription-refill');
  } 
  else if (input?.includes('information') || input?.includes('hours') || digits === '2') {
    twiml.redirect('/pharmacy-information');
  } 
  else if (input?.includes('pharmacist') || digits === '0') {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Transferring you to a pharmacist. Please hold.');
    twiml.dial(PHARMACY_INFO.phone);
  } 
  else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I did not understand your response.');
    twiml.redirect('/main-menu');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ PHARMACY INFORMATION ------
app.post('/pharmacy-information', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.gather({
    input: 'speech dtmf',
    timeout: 2,
    action: '/process-information-choice',
    speechModel: 'phone_call'
  }).say({
    voice: 'Polly.Joanna'
  }, `${PHARMACY_INFO.name} is located at ${PHARMACY_INFO.address}. Our hours are ${PHARMACY_INFO.hours}. For more information, say "more" or press 1. To return to the main menu, say "menu" or press 2.`);

  // If no input, return to main menu
  twiml.redirect('/main-menu');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ PROCESS INFORMATION CHOICE ------
app.post('/process-information-choice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult ? req.body.SpeechResult.toLowerCase() : null;
  const digits = req.body.Digits;

  if (input?.includes('more') || digits === '1') {
    // Use GPT to answer more complex information questions
    twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/answer-faq',
      speechModel: 'phone_call'
    }).say({
      voice: 'Polly.Joanna'
    }, 'What would you like to know about our pharmacy?');
  } else {
    twiml.redirect('/main-menu');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ ANSWER FAQ WITH AI ------
app.post('/answer-faq', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const question = req.body.SpeechResult;

  if (!question) {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I didn\'t catch that. Let me take you back to the main menu.');
    twiml.redirect('/main-menu');
  } else {
    try {
      // Generate answer with GPT
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a helpful pharmacy assistant AI for ${PHARMACY_INFO.name}. 
                     Provide brief, accurate information about pharmacy services, 
                     general medication information, and store policies. 
                     Do not provide medical advice or discuss specific medications.
                     Keep responses under 30 seconds of spoken text.
                     Don't discuss prices or insurance details.`
          },
          {
            role: "user",
            content: question
          }
        ],
        max_tokens: 150
      });

      const answer = completion.choices[0].message.content;

      twiml.say({
        voice: 'Polly.Joanna'
      }, answer);

      // Ask if they want to return to main menu
      twiml.gather({
        input: 'speech dtmf',
        timeout: 2,
        action: '/return-to-menu',
        speechModel: 'phone_call'
      }).say({
        voice: 'Polly.Joanna'
      }, 'Would you like to ask another question or return to the main menu? Say "question" or press 1 for another question. Say "menu" or press 2 to return to the main menu.');
    } catch (error) {
      console.error('Error with OpenAI:', error);
      twiml.say({
        voice: 'Polly.Joanna'
      }, 'I apologize, but I\'m having trouble answering your question right now. Let me connect you with a pharmacist who can help.');
      twiml.dial(PHARMACY_INFO.phone);
    }
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ RETURN TO MENU OR ASK ANOTHER QUESTION ------
app.post('/return-to-menu', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult ? req.body.SpeechResult.toLowerCase() : null;
  const digits = req.body.Digits;

  if (input?.includes('question') || digits === '1') {
    twiml.redirect('/process-information-choice');
  } else {
    twiml.redirect('/main-menu');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ PRESCRIPTION REFILL ------
app.post('/prescription-refill', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say({
    voice: 'Polly.Joanna'
  }, 'To request a prescription refill, I\'ll need to verify your identity.');

  // Gather patient information
  twiml.gather({
    input: 'speech',
    timeout: 5,
    action: '/verify-identity',
    speechModel: 'phone_call'
  }).say({
    voice: 'Polly.Joanna'
  }, 'Please say your full name.');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ VERIFY IDENTITY ------
app.post('/verify-identity', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const patientName = req.body.SpeechResult;

  // Store the name in session
  // In a real system, you would save this in a secure session store
  // For demo purposes, we're passing it in the URL parameters
  const encodedName = encodeURIComponent(patientName);

  // Next, ask for date of birth
  twiml.gather({
    input: 'speech dtmf',
    timeout: 5,
    action: `/verify-dob?name=${encodedName}`,
    speechModel: 'phone_call'
  }).say({
    voice: 'Polly.Joanna'
  }, 'Thank you. Please say or enter your date of birth in month, day, year format. For example, January 1st, 1980.');

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ VERIFY DATE OF BIRTH ------
app.post('/verify-dob', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const patientName = req.query.name;
  const dob = req.body.SpeechResult || req.body.Digits;

  // In a real application, you would validate this information against Liberty Software RXQ
  // Simulating a validation check:
  const isValidPatient = true; // Placeholder for actual validation

  if (isValidPatient) {
    twiml.say({
      voice: 'Polly.Joanna'
    }, `Thank you for verifying your identity, ${patientName}.`);

    twiml.gather({
      input: 'speech dtmf',
      timeout: 5,
      action: `/get-prescription-number?name=${encodeURIComponent(patientName)}&dob=${encodeURIComponent(dob)}`,
      speechModel: 'phone_call'
    }).say({
      voice: 'Polly.Joanna'
    }, 'Please say or enter your prescription number. You can find this on your prescription label.');
  } else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I\'m having trouble verifying your information. Let me transfer you to a pharmacist who can help.');
    twiml.dial(PHARMACY_INFO.phone);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ GET PRESCRIPTION NUMBER ------
app.post('/get-prescription-number', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const patientName = req.query.name;
  const dob = req.query.dob;
  const rxNumber = req.body.SpeechResult || req.body.Digits;

  // Here you would check the prescription status in Liberty Software RXQ
  // Simulating a check:
  const canRefill = true; // Placeholder for actual check
  const refillStatus = "available"; // Could be: "available", "too_soon", "expired", "no_refills"

  if (canRefill && refillStatus === "available") {
    // Process the refill request
    twiml.say({
      voice: 'Polly.Joanna'
    }, `Thank you. I've submitted a request to refill prescription number ${rxNumber}. Your refill should be ready for pickup tomorrow after 2pm. We'll send a text message when it's ready.`);

    // Here you would actually submit the refill request to Liberty Software RXQ
    // Example of what this might look like:
    /*
    await axios.post(`${LIBERTY_API.baseUrl}/refills`, {
      rxNumber: rxNumber,
      patientName: patientName,
      patientDOB: dob,
      apiKey: LIBERTY_API.apiKey
    });
    */

    twiml.gather({
      input: 'speech dtmf',
      timeout: 3,
      action: '/final-options',
      speechModel: 'phone_call'
    }).say({
      voice: 'Polly.Joanna'
    }, 'Is there anything else you need help with today? Say "yes" or press 1 for more options, or say "no" or press 2 to end the call.');
  } else {
    // Handle cases where refill isn't available
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I\'m sorry, but it looks like this prescription may not be eligible for refill at this time. Let me connect you with a pharmacist who can assist you further.');
    twiml.dial(PHARMACY_INFO.phone);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ FINAL OPTIONS ------
app.post('/final-options', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const input = req.body.SpeechResult ? req.body.SpeechResult.toLowerCase() : null;
  const digits = req.body.Digits;

  if (input?.includes('yes') || digits === '1') {
    twiml.redirect('/main-menu');
  } else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, `Thank you for calling ${PHARMACY_INFO.name}. Have a great day!`);
    twiml.hangup();
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ------ START SERVER ------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pharmacy Voice AI server is running on port ${PORT}`);
});
