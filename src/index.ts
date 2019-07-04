/* eslint-disable  func-names */
/* eslint-disable  no-console */
import { SkillBuilders } from "ask-sdk";
import {
  RequestInterceptor,
  RequestHandler,
  HandlerInput,
  ErrorHandler,
  ResponseInterceptor,
} from "ask-sdk-core";
import { Response, IntentRequest, Slot, Intent, SessionEndedRequest, slu } from "ask-sdk-model";
import * as moment from "moment-timezone";

interface SessionAttributes {
  timeOfDay?: TimeOfDay;
  isNew: boolean;
  recommendations: Recommendations;
  profile: Profile;
  intents: {
    [intentName: string]: Intent | undefined;
  };
}
type PersistenceAttributes = SessionAttributes;

type TimeOfDay = "midnight" | "breakfast" | "brunch" | "lunch" | "dinner";

// Update 2018/9/10 - If you see any module errors such as:
//
// serviceClientFactory.getUpsServiceClient is not a function
//
// try deleting the modules in your node_modules folder and run `npm install` again.

class LaunchRequestHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "LaunchRequest";
  }
  public handle(handlerInput: HandlerInput): Response {

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

    const speechText = getWelcomeMessage(sessionAttributes)
      + " "
      + getPrompt(sessionAttributes);

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withAskForPermissionsConsentCard(permissions)
      .getResponse();
  }
}

class LaunchRequestWithConsentTokenHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "LaunchRequest"
      && handlerInput.requestEnvelope.context.System.user.permissions !== undefined
      && handlerInput.requestEnvelope.context.System.user.permissions.consentToken !== undefined;
  }
  public async handle(handlerInput: HandlerInput): Promise<Response> {
    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

    const speechText = getWelcomeMessage(sessionAttributes)
      + " "
      + getPrompt(sessionAttributes);

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
}

class SIPRecommendationIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
      && handlerInput.requestEnvelope.request.dialogState !== "COMPLETED";
  }
  public handle(handlerInput: HandlerInput): Response {

    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    const { responseBuilder } = handlerInput;
    const result = disambiguateSlot(getSlotValues(currentIntent.slots!));

    console.log("disambiguateSlot:", JSON.stringify(result));

    if (result) {
      responseBuilder
        .speak(result.prompt)
        .reprompt(result.prompt)
        .addElicitSlotDirective(result.slotName, currentIntent);
    } else {
      responseBuilder.addDelegateDirective(currentIntent);
    }

    console.log("RESPONSE:", JSON.stringify(responseBuilder.getResponse()));
    return responseBuilder
      .getResponse();
  }
}

// class CustomerProvidedMealRecommendationIntentHandler implements RequestHandler {
//    public canHandle(handlerInput: HandlerInput): boolean {
//     return handlerInput.requestEnvelope.request.type === "IntentRequest"
//       && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
//       && handlerInput.requestEnvelope.request.intent.slots.meal.value;
//   }
//   public handle(handlerInput: HandlerInput): Response {

//   }
// };

class SuggestMealRecommendationIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

    const slotNames = ["timeOfDay", "cuisine", "allergies", "diet"];

    console.log("SuggestMealRecommendationIntent - meals:", sessionAttributes.recommendations.current.meals.length);
    console.log("SuggestMealRecommendationIntent - meals:", JSON.stringify(sessionAttributes.recommendations.current.meals));

    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
      && handlerInput.requestEnvelope.request.intent.slots !== undefined
      && !handlerInput.requestEnvelope.request.intent.slots.meal.value
      && intentSlotsHaveBeenFilled(handlerInput.requestEnvelope.request.intent, slotNames)
      && !intentSlotsNeedDisambiguation(handlerInput.requestEnvelope.request.intent, slotNames);
  }
  public handle(handlerInput: HandlerInput): Response {
    console.log("SuggestMealRecommendationIntent:", handlerInput.requestEnvelope.request);

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;

    // TODO: Do the look up here!

    sessionAttributes.recommendations.current.meals = ["Domi Maeuntang", "Mae Un Tang", "Daegu Jorim"];
    attributesManager.setSessionAttributes(sessionAttributes);

    console.log("currentIntent.slots:", JSON.stringify(currentIntent.slots));

    return handlerInput.responseBuilder
      .speak("Great, I've found 3 meals: Domi Maeuntang, Mae Un Tang and Daegu Jorim which sounds best?")
      .reprompt("Which sounds best Domi Maeuntang, Mae Un Tang or Daegu Jorim?")
      .addElicitSlotDirective("meal", currentIntent)
      .getResponse();
  }
}

// TODO: handler for meals containing ingredients that conflict with their allergies and diet.

// TODO: remove this since we no longer need it.
/*class promptForDeliveryOption implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
      && handlerInput.requestEnvelope.request.intent.slots !== undefined
      && handlerInput.requestEnvelope.request.intent.slots.meal.value !== undefined
      && !handlerInput.requestEnvelope.request.intent.slots.deliveryOption.value !== undefined;
  }
  public handle(handlerInput: HandlerInput): Response {

    return handlerInput.responseBuilder
      .speak("Which would like, eat in, eat out, or make it?")
      .reprompt("Would like to eat in, eat out, or make it?")
      .addElicitSlotDirective("deliveryOption")
      .getResponse();

  }
}*/

class CRecommendationIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
      && handlerInput.requestEnvelope.request.dialogState === "COMPLETED";
  }
  public handle(handlerInput: HandlerInput): Response {
    console.log("COMPLETED RecommendationIntent");

    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    const slotValues = getSlotValues(currentIntent.slots!);

    const attributesManager = handlerInput.attributesManager;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

    sessionAttributes.recommendations.previous.meal = slotValues.meal.synonym;
    sessionAttributes.intents[currentIntent.name] = undefined;

    console.log("deleting slot data for:", currentIntent.name);
    console.log("after delete:", JSON.stringify(sessionAttributes));

    attributesManager.setSessionAttributes(sessionAttributes);

    let speechText = "";

    // TODO: split this into different completed handlers
    if (slotValues.deliveryOption.statusCode === "ER_SUCCESS_MATCH") {

      if (slotValues.deliveryOption.resolvedValues[0].value !== "make") {
        const address = sessionAttributes.profile.location.address;
        if (address.zip || address.city && address.state) {
          // TODO: look up where the restaurants would be
          console.log("look up the restaurants");
          speechText = "There's 2 restaurants close by korean bamboo and One pot. Which would you like?";

        } else {
          console.log("We need to elicit for address");
          speechText = "To find a restaurant close by I need to know your address. What city do you live in?";
        }
      } else {
        // TODO prompt for portion
        speechText = "Which would you like a small, medium, or large portion size?";
      }
    } else {
      // TODO: validate input for options - if we don't know ER_SUCCESS_NO_MATCH ask again
      speechText = "Which would you like? to eat out, order delivery, or cook";
      return handlerInput.responseBuilder
        .addElicitSlotDirective("deliveryOption")
        .speak(speechText)
        .reprompt(speechText)
        .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
}

// TODO: remove this
// class GetMealIntentHandler implements RequestHandler {
// public canHandle(handlerInput: HandlerInput): boolean {
//     return handlerInput.requestEnvelope.request.type === "IntentRequest"
//       && handlerInput.requestEnvelope.request.intent.name === "GetMealIntent";
//   }
//   public handle(handlerInput: HandlerInput): Response {
//     return handlerInput.responseBuilder
//       .speak("Hello there")
//       .getResponse();
//   }
// };

// TODO: remove this
class LookupRestaurantIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "LookupRestaurantIntent";
  }
  public handle(handlerInput: HandlerInput): Response {
    return handlerInput.responseBuilder
      .speak("I've sent Korean Bamboo's address to the Alexa App. Bon apetit!")
      .getResponse();
  }
}

class InProgressCaptureAddressIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "CaptureAddressIntent"
      && handlerInput.requestEnvelope.request.dialogState !== "COMPLETED";
  }
  public handle(handlerInput: HandlerInput): Response {
    return handlerInput.responseBuilder
      .addDelegateDirective()
      .getResponse();
  }
}

class InProgressHasZipCaptureAddressIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && currentIntent.name === "CaptureAddressIntent"
      && intentSlotsHaveBeenFilled(currentIntent, ["zip"])
      && handlerInput.requestEnvelope.request.dialogState !== "COMPLETED";
  }
  public handle(handlerInput: HandlerInput): Response {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    const slotValues = getSlotValues(currentIntent.slots!);
    let speechText = "There's 2 restaurants close to " + slotValues.zip.synonym;
    speechText += " Korean Bamboo and One pot. Which would you like?";
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
}

class InProgressHasCityStateCaptureAddressIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && currentIntent.name === "CaptureAddressIntent"
      && intentSlotsHaveBeenFilled(currentIntent, ["city", "state"])
      && handlerInput.requestEnvelope.request.dialogState !== "COMPLETED";
  }
  public handle(handlerInput: HandlerInput): Response {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    const slotValues = getSlotValues(currentIntent.slots!);
    const speechText = "There's 2 restaurants close to " + slotValues.city.synonym
      + ", "
      + slotValues.state.synonym
      + " Korean Bamboo and One pot. Which would you like?";
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
}

class HelpIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "AMAZON.HelpIntent";
  }
  public handle(handlerInput: HandlerInput): Response {
    const speechText = "This is the foodie. I will find the best meal and restaurant recommendations for you. To get started say I'm hungry";

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .withSimpleCard("The Foodie", speechText)
      .getResponse();
  }
}

class CancelAndStopIntentHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "IntentRequest"
      && (handlerInput.requestEnvelope.request.intent.name === "AMAZON.CancelIntent"
        || handlerInput.requestEnvelope.request.intent.name === "AMAZON.StopIntent");
  }
  public handle(handlerInput: HandlerInput): Response {
    const speechText = "Goodbye!";

    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard("The Foodie", speechText)
      .getResponse();
  }
}

class SessionEndedRequestHandler implements RequestHandler {
  public canHandle(handlerInput: HandlerInput): boolean {
    return handlerInput.requestEnvelope.request.type === "SessionEndedRequest";
  }
  public handle(handlerInput: HandlerInput): Response {
    console.log(`Session ended with reason: ${(handlerInput.requestEnvelope.request as SessionEndedRequest).reason}`);

    return handlerInput.responseBuilder.getResponse();
  }
}

class CustomErrorHandler implements ErrorHandler {
  public canHandle() {
    return true;
  }
  public handle(handlerInput: HandlerInput, error: Error) {
    console.log(`Error handled: ${error.message}`);
    console.log(error.stack);

    return handlerInput.responseBuilder
      .speak("Sorry, I can't understand the command. Please say again.")
      .reprompt("Sorry, I can't understand the command. Please say again.")
      .getResponse();
  }
}

/* RESPONSE INTERCEPTORS */

// This interceptor loads our profile from persistent storage into the session
// attributes.
class NewSessionRequestInterceptor implements RequestInterceptor {
  public async process(handlerInput: HandlerInput) {
    console.log("request:", JSON.stringify(handlerInput.requestEnvelope.request));

    const attributesManager = handlerInput.attributesManager;
    let sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

    if (!sessionAttributes.intents) {
      sessionAttributes.intents = {};
    }

    if (handlerInput.requestEnvelope.session &&
      handlerInput.requestEnvelope.session.new) {

      const persistentAttributes = await attributesManager.getPersistentAttributes() as PersistenceAttributes;

      console.log("persistentAttributes:", JSON.stringify(persistentAttributes));

      if (!persistentAttributes.profile) {
        console.log("Initializing new profile...");
        sessionAttributes.isNew = true;
        sessionAttributes.profile = initializeProfile();
        sessionAttributes.recommendations = initializeRecommendations();
      } else {
        console.log("Restoring profile from persistent store.");
        sessionAttributes.isNew = false;
        sessionAttributes = persistentAttributes;
      }

      console.log("set sessionAttributes to:", JSON.stringify(sessionAttributes));
      attributesManager.setSessionAttributes(sessionAttributes);
    }
  }
}

class SetTimeOfDayInterceptor implements RequestInterceptor {
  public async process(handlerInput: HandlerInput) {

    const { requestEnvelope, serviceClientFactory, attributesManager } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;
    const device = requestEnvelope.context.System.device;

    // look up the time of day if we don't know it already.
    if (device && serviceClientFactory && !sessionAttributes.timeOfDay) {
      const deviceId = device.deviceId;

      const upsServiceClient = serviceClientFactory.getUpsServiceClient();
      const timezone = await upsServiceClient.getSystemTimeZone(deviceId);

      const currentTime = getCurrentTime(timezone);
      const timeOfDay = getTimeOfDay(currentTime);

      sessionAttributes.timeOfDay = timeOfDay;
      sessionAttributes.profile.location.timezone = timezone;
      attributesManager.setSessionAttributes(sessionAttributes);

      console.log("SetTimeOfDayInterceptor - currentTime:", currentTime);
      console.log("SetTimeOfDayInterceptor - timezone:", timezone);
      console.log("SetTimeOfDayInterceptor - time of day:", timeOfDay);
      console.log("SetTimeOfDayInterceptor - sessionAttributes", JSON.stringify(sessionAttributes));
    }
  }
}

class HasConsentTokenRequestInterceptor implements ResponseInterceptor {
  public async process(handlerInput: HandlerInput) {
    const { requestEnvelope, serviceClientFactory, attributesManager } = handlerInput;
    const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;
    const device = requestEnvelope.context.System.device;

    if (device && serviceClientFactory && handlerInput.requestEnvelope.context.System.user.permissions
      && handlerInput.requestEnvelope.context.System.user.permissions.consentToken
      && (!sessionAttributes.profile.location.address.city
        || !sessionAttributes.profile.location.address.state
        || !sessionAttributes.profile.location.address.zip)) {

      const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
      const address = await deviceAddressServiceClient.getFullAddress(device.deviceId);

      console.log(JSON.stringify(address));

      if (address.postalCode) {
        sessionAttributes.profile.location.address.zip = address.postalCode;
      } else if (address.city && address.stateOrRegion) {
        sessionAttributes.profile.location.address.city = address.city;
        sessionAttributes.profile.location.address.state = address.stateOrRegion;
      }

      attributesManager.setSessionAttributes(sessionAttributes);
      console.log("HasConsentTokenRequestInterceptor - sessionAttributes", JSON.stringify(sessionAttributes));
    }
  }
}

// This interceptor initializes our slots with the values from the user profile.
class RecommendationIntentStartedRequestInterceptor implements ResponseInterceptor {
  public async process(handlerInput: HandlerInput) {
    if (handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.intent.name === "RecommendationIntent"
      && handlerInput.requestEnvelope.request.dialogState === "STARTED") {
      console.log("recommendationIntentStartedRequestInterceptor:", "Initialize the session attributes for the intent.");

      const attributesManager = handlerInput.attributesManager;
      const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;
      const profile = sessionAttributes.profile;

      // handlerInput is passed by reference so any modification we make in
      // our interceptor will be present in our intent handler's canHandle and
      // handle function
      const updatedIntent = handlerInput.requestEnvelope.request.intent;

      if (updatedIntent.slots) {
        updatedIntent.slots.name.value = profile.name || undefined;
        updatedIntent.slots.diet.value = profile.diet || undefined;
        updatedIntent.slots.allergies.value = profile.allergies || undefined;
        updatedIntent.slots.timeOfDay.value = sessionAttributes.timeOfDay || undefined;
      }

      console.log(JSON.stringify(updatedIntent));
    }
  }
}

// This interceptor looks at the slots belonging to the request.
// If allergies or diet have been provided, it will store them in the user
// profile stored in the session attributes. When the skill closes, this
// information will be saved.
class RecommendationIntentCaptureSlotToProfileInterceptor implements ResponseInterceptor {
  public async process(handlerInput: HandlerInput) {
    const intentName = "RecommendationIntent";
    const slotNames = ["allergies", "diet"];
    console.log("recommendationIntentCaptureSlotToProfileInterceptor");
    saveNewlyFilledSlotsToSessionAttributes(handlerInput, intentName, slotNames, (sessionAttributes, slotName, newlyFilledSlot) => {
      sessionAttributes.profile[slotName] = (newlyFilledSlot as any).synonym;
    });
  }
}

// This interceptor looks at the slots belonging to the request.
// If zip, city or state have been provided, it will store them in the user
// location attributes. When the skill closes, this information will be saved.
class CaptureAddressIntentCaptureSlotsToProfileInterceptor implements ResponseInterceptor {
  public async process(handlerInput: HandlerInput) {
    const intentName = "CaptureAddressIntent";
    const slotNames = ["zip", "city", "state"];
    console.log("CaptureAddressIntentCaptureSlotsToProfileInterceptor call saveNewlyFilledSlotsToSessionAttributes");
    saveNewlyFilledSlotsToSessionAttributes(handlerInput, intentName, slotNames, (sessionAttributes, slotName, newlyFilledSlot) => {
      sessionAttributes.profile.location.address[slotName] = (newlyFilledSlot as any).synonym;
    });
  }
}

// given an intent name and a set of slots, saveNewlyFilledSlotsToSessionAttributes
// will save newly filled values of the given slots into the session attributes.
// The callback allows you to set the slot value into session attributes however
// you want.
function saveNewlyFilledSlotsToSessionAttributes(handlerInput: HandlerInput, intentName: string, slotNames: string[], callback: (sessionAttributes: { [key: string]: any }, slotName: string, newlyFilledSlot: SlotValue) => void) {
  const attributesManager = handlerInput.attributesManager;
  const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

  if (handlerInput.requestEnvelope.request.type === "IntentRequest"
    && handlerInput.requestEnvelope.request.intent.name === intentName) {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;
    const previousIntent = sessionAttributes.intents[currentIntent.name];
    console.log("CALL intentHasNewlyFilledSlots IN saveNewlyFilledSlotsToSessionAttributes ");
    const newlyFilledSlots = intentHasNewlyFilledSlots(slotNames, currentIntent, previousIntent);
    console.log("saveNewlyFilledSlotsToSessionAttributes");

    // We only save if the slot(s) has been filled with something new.
    if (newlyFilledSlots.found) {

      Object.keys(newlyFilledSlots.slots).forEach((slotName) => {
        console.log("inserting:",
          slotName, JSON.stringify(newlyFilledSlots.slots[slotName]),
          JSON.stringify(sessionAttributes));
        callback(sessionAttributes, slotName, newlyFilledSlots.slots[slotName]);
      });

      attributesManager.setSessionAttributes(sessionAttributes);
    }
  }
}

// This interceptor handles intent switching during dialog management by
// syncing the previously collected slots stored in the session attributes
// with the current intent. The slots currently collected take precedence so
// the user is able to overidde previously collected slots.
class DialogManagementStateInterceptor implements RequestInterceptor {
  public process(handlerInput: HandlerInput) {
    const currentIntent = (handlerInput.requestEnvelope.request as IntentRequest).intent;

    if (handlerInput.requestEnvelope.request.type === "IntentRequest"
      && handlerInput.requestEnvelope.request.dialogState !== "COMPLETED") {

      const attributesManager = handlerInput.attributesManager;
      const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;

      // If there are no session attributes we've never entered dialog management
      // for this intent before.
      if (sessionAttributes.intents[currentIntent.name] &&
        currentIntent.slots &&
        sessionAttributes.intents[currentIntent.name]!.slots) {

        const currentIntentSlots = sessionAttributes.intents[currentIntent.name]!.slots;
        for (const key in currentIntentSlots) {

          // we let the current intent's values override the session attributes
          // that way the user can override previously given values.
          // this includes anything we have previously stored in their profile.
          if (currentIntentSlots[key].value && !currentIntent.slots[key].value) {
            currentIntent.slots[key] = currentIntentSlots[key];
          }
        }
      }

      sessionAttributes.intents[currentIntent.name] = currentIntent;
      attributesManager.setSessionAttributes(sessionAttributes);
    }
  }
}

/* Response INTERCEPTORS */

// This Response interceptor detects if the skill is going to exit and saves the
// session attributes into the persistent store.
class SessionWillEndInterceptor implements ResponseInterceptor {
  public async process(handlerInput: HandlerInput, responseOutput: Response) {

    // let shouldEndSession = responseOutput.shouldEndSession;
    // shouldEndSession = (typeof shouldEndSession == "undefined" ? true : shouldEndSession);
    const requestType = handlerInput.requestEnvelope.request.type;

    const ses = (typeof responseOutput.shouldEndSession === "undefined" ? true : responseOutput.shouldEndSession);

    console.log("responseOutput:", JSON.stringify(responseOutput));

    if (ses && !responseOutput.directives || requestType === "SessionEndedRequest") {

      // if(shouldEndSession || requestType == 'SessionEndedRequest') {
      console.log("SessionWillEndInterceptor", "end!");
      const attributesManager = handlerInput.attributesManager;
      const sessionAttributes = attributesManager.getSessionAttributes() as SessionAttributes;
      const persistentAttributes = await attributesManager.getPersistentAttributes();

      persistentAttributes.profile = sessionAttributes.profile;
      persistentAttributes.recommendations = sessionAttributes.recommendations;
      persistentAttributes.recommendations.current.meals = [];

      console.log(JSON.stringify(sessionAttributes));

      attributesManager.setPersistentAttributes(persistentAttributes);
      attributesManager.savePersistentAttributes();
    }
  }
}

/* CONSTANTS */
const permissions = ["read::alexa:device:all:address"];

const requiredSlots: { [key: string]: boolean } = {
  allergies: true,
  meal: true,
  cuisine: true,
  diet: true,
  deliveryOption: true,
  timeOfDay: true,
};

/* HELPER FUNCTIONS */

interface Address {
  city: string;
  state: string;
  zip: string;
}

interface Location {
  address: Address;
  timezone: string;
}

interface Profile {
  name: string;
  allergies: string;
  diet: string;
  location: Location;
}

function initializeProfile(): Profile {
  return {
    name: "",
    allergies: "",
    diet: "",
    location: {
      address: {
        city: "",
        state: "",
        zip: "",
      },
      timezone: "",
    },
  };
}

interface Recommendations {
  previous: {
    meal?: string,
    restaurant?: string,
  };
  current: {
    meals: string[];
    restaurants: string[];
  };
}

function initializeRecommendations(): Recommendations {
  return {
    previous: {
      meal: "",
      restaurant: "",
    },
    current: {
      meals: [],
      restaurants: [],
    },
  };
}

// gets the welcome message based upon the context of the skill.
function getWelcomeMessage(sessionAttributes: { [key: string]: any }) {

  let speechText = "";

  if (sessionAttributes.isNew) {
    speechText += "<say-as interpret-as=\"interjection\">Howdy!</say-as> ";
    speechText += "Welcome to The Foodie! ";
    speechText += "I'll help you find the right food right now. ";
    speechText += "To make that easier, you can give me permission to access your location, ";
    speechText += "just check the Alexa app. ";
  } else {
    speechText += "Welcome back!! ";

    const timeOfDay = sessionAttributes.timeOfDay;
    if (timeOfDay) {
      speechText += getTimeOfDayMessage(timeOfDay);
    } else {
      speechText += "It's time to stuff your face with delicious food. ";
    }

    if (sessionAttributes.recommendations.previous.meal) {
      speechText += "It looks like last time you had " + sessionAttributes.recommendations.previous.meal + ". ";
      speechText += "I wonder what it will be today. ";
    }

  }
  return speechText;
}

function getTimeOfDayMessage(timeOfDay: TimeOfDay) {
  const messages = timeOfDayMessages[timeOfDay];
  return randomPhrase(messages);

}

function randomPhrase<T>(items: T[]) {
  const i = Math.floor(Math.random() * items.length);
  return (items[i]);
}

const timeOfDayMessages: { [key in TimeOfDay]: string[] } = {
  breakfast: [
    "It looks like it's breakfast. ",
    "<say-as interpret-as=\"interjection\">cock a doodle doo</say-as> It's time for breakfast. ",
    "Good morning! Time for breakfast",

  ],
  brunch: [
    "<say-as interpret-as=\"interjection\">cock a doodle doo</say-as> Let's get some brunch! ",
    "It's time for brunch. ",
  ],
  lunch: [
    "Lunch time! ",
    "Time for lunch. ",
  ],
  dinner: [
    "It's dinner time. ",
    "It's supper time. ",
  ],
  midnight: [
    "<say-as interpret-as=\"interjection\">wowza</say-as> You're up late! You looking for a midnight snack? ",
    "It's time for a midnight snack. ",
  ],
};

// gets the prompt based upon the context of the skill.
function getPrompt(sessionAttributes: { [key: string]: any }) {

  let speechText = "How rude of me. I forgot to ask. What's your name?";
  if (!sessionAttributes.isNew) {
    speechText = "Let's narrow it down. What flavors do you feel like? You can say things like spicy, savory, greasy, and fresh.";
  }

  return speechText;
}

interface ResolvedValue {
  value: string;
  id?: string;
}

interface SlotValue {
  synonym?: string;
  authority?: string;
  statusCode?: slu.entityresolution.StatusCode;
  resolvedValues: ResolvedValue[];
}

// given the slots object from the JSON Request to the skill, builds a simplified
// object which simplifies inpecting slots for entity resultion matches.
function getSlotValues(slots: { [key: string]: Slot }): { [key: string]: SlotValue } {

  const slotValues: { [key: string]: SlotValue } = {};

  Object.keys(slots).forEach((key) => {
    const slot = slots[key];

    slotValues[key] = {
      synonym: slot.value || undefined,
      resolvedValues: (slot.value ? [{ value: slot.value }] : []),
      statusCode: undefined,
    };

    const statusCode = (((((slot || {})
      .resolutions || {})
      .resolutionsPerAuthority || [])[0] || {})
      .status || {})
      .code;

    const authority = ((((slot || {})
      .resolutions || {})
      .resolutionsPerAuthority || [])[0] || {})
      .authority;

    slotValues[key].authority = authority;

    // any value other than undefined then entity resolution was successful
    if (statusCode) {
      slotValues[key].statusCode = statusCode;

      // we have resolved value(s)!
      if (slot &&
        slot.resolutions !== undefined &&
        slot.resolutions.resolutionsPerAuthority &&
        slot.resolutions.resolutionsPerAuthority[0].values) {

        const resolvedValues = slot.resolutions.resolutionsPerAuthority[0].values;
        slotValues[key].resolvedValues = [];
        resolvedValues.forEach((resolvedValue) => {
          slotValues[key].resolvedValues.push({
            value: resolvedValue.value.name,
            id: resolvedValue.value.id,
          });
        });
      }
    }
  });
  return slotValues;
}

function getNewSlots(previous: { [key: string]: Slot }, current: { [key: string]: Slot }) {
  const previousSlotValues = getSlotValues(previous);
  const currentSlotValues = getSlotValues(current);

  const newlyCollectedSlots: { [key: string]: SlotValue } = {};
  for (const slotName in previousSlotValues) {
    // resolvedValues and statusCode are dependent on our synonym so we only
    // need to check if there's a difference of synonyms.
    if (previousSlotValues[slotName].synonym !== currentSlotValues[slotName].synonym) {
      newlyCollectedSlots[slotName] = currentSlotValues[slotName];
    }
  }
  return newlyCollectedSlots;
}

// intentHasNewlyFilledSlots given a previous and current intent and a set of
// slots, this function will compare the previous intent's slots with current
// intent's slots to determine what's new. The results are filtered by the
// provided array of "slots". For example if you wanted to determine if there's
// a new value for the "state" and "city" slot you would pass the previous and
// current intent and an array containing both strings. If previous is undefined,
// all filled slots are treated as newly filled.
// Returns:
// {
//   found: (true | false)
//   slots: object of slots returned from getSlots
// }
function intentHasNewlyFilledSlots(slotNames: string[], currentIntent: Intent, previousIntent?: Intent) {

  let newSlots: { [key: string]: SlotValue };
  // if we don't have a previous intent then all non-empty intent's slots are
  // newly filled!
  if (previousIntent === undefined) {
    const slotValues = getSlotValues(currentIntent.slots!);
    newSlots = {};
    Object.keys(slotValues).forEach((slotName) => {
      if (slotValues[slotName].synonym) {
        newSlots[slotName] = slotValues[slotName];
      }
    });
  } else {
    newSlots = getNewSlots(currentIntent.slots!, previousIntent.slots!);
  }

  const results: {
    found: boolean,
    slots: { [key: string]: SlotValue },
  } = {} as any;

  slotNames.forEach((slot) => {
    if (newSlots[slot]) {
      results.slots = results.slots ? results.slots : {};
      results.slots[slot] = newSlots[slot];
      results.found = true;
    }
  });
  return results;
}

function buildDisambiguationPrompt(resolvedValues: ResolvedValue[]) {
  let output = "Which would you like";
  resolvedValues.forEach((resolvedValue, index) => {
    output += `${(index === resolvedValues.length - 1) ? " or " : " "}${resolvedValue.value}`;
  });
  output += "?";
  return output;
}

function disambiguateSlot(slotValues: { [key: string]: SlotValue }) {
  let result;
  for (const slotName in slotValues) {
    if (slotValues[slotName].resolvedValues.length > 1 && requiredSlots[slotName]) {
      console.log("disambiguate:", slotValues[slotName]);
      result = {
        slotName,
        prompt: buildDisambiguationPrompt(slotValues[slotName].resolvedValues),
      };
      break;
    }
  }
  return result;
}

// given an intent and an array slots, intentSlotsHaveBeenFilled will determine
// if all of the slots in the array have been filled.
// Returns:
// (true | false)
function intentSlotsHaveBeenFilled(intent: Intent, slotNames: string[]) {
  const slotValues = getSlotValues(intent.slots!);
  console.log("slot values:", JSON.stringify(slotValues));
  let result = true;
  slotNames.forEach((slotName) => {
    console.log("intentSlotsHaveBeenFilled:", slotName);
    if (!slotValues[slotName].synonym) {
      result = false;
    }
  });

  return result;
}

function intentSlotsNeedDisambiguation(intent: Intent, slotNames: string[]) {
  const slotValues = getSlotValues(intent.slots!);
  let result = false;
  slotNames.forEach((slotName) => {
    console.log(slotValues[slotName].resolvedValues.length);
    if (slotValues[slotName].resolvedValues.length > 1) {
      result = true;
    }
  });
  console.log("intentSlotsNeedDisambiguation", result);
  return result;
}

function getCurrentTime(timezone: string) {
  const currentTime = moment.utc().tz(timezone);
  return currentTime;
}

function getTimeOfDay(currentTime: moment.Moment): TimeOfDay {
  const currentHour = currentTime.hours();
  const currentMinutes = currentTime.minutes();

  const weightedHour = (currentMinutes >= 45) ? currentHour + 1 : currentHour;

  let timeOfDay: TimeOfDay = "midnight";
  if (weightedHour >= 6 && weightedHour <= 10) {
    timeOfDay = "breakfast";
  } else if (weightedHour === 11) {
    timeOfDay = "brunch";
  } else if (weightedHour >= 12 && weightedHour <= 16) {
    timeOfDay = "lunch";
  } else if (weightedHour >= 17 && weightedHour <= 23) {
    timeOfDay = "dinner";
  }
  return timeOfDay;
}

const skillBuilder = SkillBuilders.standard();

exports.handler = skillBuilder
  .addRequestHandlers(
    new LaunchRequestWithConsentTokenHandler(),
    new LaunchRequestHandler(),
    new SuggestMealRecommendationIntentHandler(),
    // new promptForDeliveryOption(),
    new SIPRecommendationIntentHandler(),
    new CRecommendationIntentHandler(),
    new LookupRestaurantIntentHandler(),
    // new GetMealIntentHandler(),
    new InProgressHasZipCaptureAddressIntentHandler(),
    new InProgressHasCityStateCaptureAddressIntentHandler(),
    new InProgressCaptureAddressIntentHandler(),
    new HelpIntentHandler(),
    new CancelAndStopIntentHandler(),
    new SessionEndedRequestHandler(),
  )
  .addRequestInterceptors(
    new NewSessionRequestInterceptor(),
    new SetTimeOfDayInterceptor(),
    new HasConsentTokenRequestInterceptor(),
    new RecommendationIntentStartedRequestInterceptor(),
    new RecommendationIntentCaptureSlotToProfileInterceptor(),
    new CaptureAddressIntentCaptureSlotsToProfileInterceptor(),
    new DialogManagementStateInterceptor(),
  )
  .addResponseInterceptors(new SessionWillEndInterceptor())
  .addErrorHandlers(new CustomErrorHandler())
  // .withPersistenceAdapter()
  // .withApiClient(new Alexa.DefaultApiClient())
  .withAutoCreateTable(true)
  .withTableName("theFoodie")
  .lambda();
