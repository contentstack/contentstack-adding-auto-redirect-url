const request = require('request-promise');

const {
  MANAGEMENT_TOKEN,
  BASE_REGION_URL = 'https://api.contentstack.io',
  REDIRECT_CONTENT_TYPE = 'redirects',
} = process.env;

let previousVersion;

function getEntry(
  uid,
  locale,
  ctUID,
  apiKey,
  version,
  includePublishDetails = false,
) {
  const options = {
    method: 'GET',
    uri: `${BASE_REGION_URL}/v3/content_types/${ctUID}/entries/${uid}?version=${version}&locale=${locale}&include_publish_details=${includePublishDetails}`,
    json: true,
    headers: {
      'content-Type': 'application/json',
      authorization: MANAGEMENT_TOKEN,
      api_key: apiKey,
    },
  };
  return request(options);
}

function createEntry(
  previousURL,
  currentURL,
  uid,
  contentType,
  locale,
  version,
  apiKey,
) {
  const options = {
    method: 'POST',
    uri: `${BASE_REGION_URL}/v3/content_types/${REDIRECT_CONTENT_TYPE}/entries?locale=${locale}`,
    body: {
      entry: {
        title: `Redirect to entry: ${uid} content_type: ${contentType} version: ${version}`,
        from: previousURL,
        to: currentURL,
        type: 'Permanent',
        notes: '',
        entry: {
          unique_id: uid,
          version,
          content_type: contentType,
          language: locale,
        },
      },
    },
    json: true,
    headers: {
      'content-Type': 'application/json',
      authorization: MANAGEMENT_TOKEN,
      api_key: apiKey,
    },
  };
  return request(options);
}

const isEntryEligibleForRedirection = (
  { url, _version: version, _in_progress: inProgress },
  { uid: ctUid },
) => version > 1 && url && !inProgress && REDIRECT_CONTENT_TYPE !== ctUid;

async function checkIfRedirectionRequired(entry, contentType, apiKey) {
  previousVersion = await getEntry(
    entry.uid,
    entry.locale,
    contentType.uid,
    apiKey,
    entry._version - 1,
  );
  return previousVersion.entry.url !== entry.url;
}

async function createRedirect(event, { entry, content_type: contentType }, apiKey) {
  try {
    if (isEntryEligibleForRedirection(entry, contentType)) {
      const redirectionRequired = await checkIfRedirectionRequired(
        entry,
        contentType,
        apiKey,
      );
      if (!redirectionRequired) {
        console.log('url was not changed skipping redirection');
        return Promise.resolve();
      }
      await createEntry(
        previousVersion.entry.url,
        entry.url,
        entry.uid,
        contentType.uid,
        entry.locale,
        entry._version,
        apiKey,
      );
    } else {
      console.log('entry is not eligible for redirection');
    }
    return Promise.resolve();
  } catch (e) {
    return Promise.reject(e);
  }
}

exports.create = async (event, context) => {
  try {
    const body = JSON.parse(event.body);
    const { event: webhookEvent, data, api_key: apiKey } = body;
    await createRedirect(webhookEvent, data, apiKey);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'redirect has been created',
        awsRequestId: context.awsRequestId,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: e.message,
        awsRequestId: context.awsRequestId,
        functionName: context.functionName,
        functionVersion: context.functionVersion,
      }),
    };
  }
};
