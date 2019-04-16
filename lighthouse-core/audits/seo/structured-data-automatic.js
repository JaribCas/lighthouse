/**
 * @license Copyright 2019 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('../audit');
const validateJsonLD = require('../../lib/sd-validation/sd-validation');
const i18n = require('../../lib/i18n/i18n.js');

const UIStrings = {
  /** Title of a Lighthouse audit that provides detail on whether JSON-LD structured data snippets are valid. This descriptive title is shown when no invalid JSON-LD snippets were found. */
  title: 'JSON-LD structured data syntax is valid',
  /** Title of a Lighthouse audit that provides detail on whether JSON-LD structured data snippets are valid. This descriptive title is shown when JSON-LD snippets with invalid content were found. */
  failureTitle: 'JSON-LD structured data syntax is invalid',
  /** Description of a Lighthouse audit that tells the user whether JSON-LD snippets on the page are invalid. This is displayed after a user expands the section to see more. No character length limits. */
  /* eslint-disable-next-line max-len */
  description: 'Structured data contains rich metadata about a web page. The data is used in search results and social sharing. Invalid metadata will affect how the page appears in these contexts. This audit is currently doing basic JSON-LD validation. See also the manual audit below to validate other types of structured data.',
  /** Explanatory message stating what percentage of JSON-LD structured data snippets are invalid */
  displayValue: '{validSnippetProportion, number, percent} valid snippets',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

class StructuredDataAutomatic extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'structured-data-automatic',
      title: str_(UIStrings.title),
      failureTitle: str_(UIStrings.failureTitle),
      description: str_(UIStrings.description),
      requiredArtifacts: ['ScriptElements'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts) {
    const jsonLDElements = artifacts.ScriptElements.filter(
      scr => scr.type === 'application/ld+json' && !!scr.content);

    if (jsonLDElements.length === 0) {
      return {
        notApplicable: true,
        rawValue: true,
      };
    }

    const validatedSnippets = await Promise.all(jsonLDElements.map(async (element) => {
      // We don't want to show empty lines around the snippet
      const content = (element.content || '').trim();

      return {
        devtoolsNodePath: element.devtoolsNodePath,
        content,
        errors: await validateJsonLD(content),
      };
    }));
    // Show invalid snippets at the top
    validatedSnippets.sort((a, b) => {
      return b.errors.length - a.errors.length;
    });

    const renderedSnippets = await Promise.all(
      validatedSnippets.map(async (snippetWithErrors) => {
        return renderValidatedSnippet(snippetWithErrors);
      })
    );
    const details = Audit.makeListDetails(renderedSnippets);

    const invalidSnippets = validatedSnippets.filter(sn => sn.errors.length > 0);
    const validSnippets = validatedSnippets.filter(sn => sn.errors.length === 0);
    const displayValue = str_(UIStrings.displayValue, {
      validSnippetProportion: validSnippets.length / jsonLDElements.length,
    });

    return {
      rawValue: invalidSnippets.length === 0,
      score: invalidSnippets.length === 0 ? 1 : 0,
      details,
      displayValue,
    };
  }
}

/**
 * @param {{content: string, devtoolsNodePath: string, errors: LH.StructuredData.ValidationError[]}} validatedSnippet
 */
function renderValidatedSnippet(validatedSnippet) {
  const {content, devtoolsNodePath, errors} = validatedSnippet;

  let parsedContent;
  let topLevelType;
  let topLevelName;
  try {
    parsedContent = JSON.parse(content);
    topLevelType = parsedContent['@type'];
    topLevelName = parsedContent['name'];
  } catch (err) {}

  let title = '';
  if (topLevelName && topLevelType) {
    title = `${topLevelType}: ${topLevelName}`;
  } else if (topLevelType) {
    title = `@type ${topLevelType}`;
  } else {
    title = 'Invalid JSON-LD element';
  }

  title += ` (${errors.length} Error${errors.length !== 1 ? 's' : ''})`;

  /** @type LH.Audit.Details.NodeValue */
  const node = {
    type: 'node',
    path: devtoolsNodePath,
    snippet: `<script type="application/ld+json">`,
  };

  const {lineMessages, generalMessages} = getErrorMessages(errors);

  return Audit.makeSnippetDetails({
    content: parsedContent ? JSON.stringify(parsedContent, null, 2) : content,
    title,
    lineMessages,
    generalMessages,
    node,
  });
}

/**
 * @param {Array<LH.StructuredData.ValidationError>} errors
 */
function getErrorMessages(errors) {
  /** @type {LH.Audit.Details.SnippetValue['lineMessages']} */
  const lineMessages = [];
  /** @type {LH.Audit.Details.SnippetValue['generalMessages']} */
  const generalMessages = [];
  errors.forEach(({
    message, lineNumber, validTypes, validator,
  }) => {
    if (validTypes && validator === 'schema-org') {
      const typeStrings = validTypes.map(type => {
        const typeNameMatch = type.match(/[\w]+$/);

        const typeName = typeNameMatch ? typeNameMatch[0] : type;
        const typeUrl = type.replace('http://', 'https://');
        return `[${typeName}](${typeUrl})`;
      });
      message = `Invalid ${typeStrings.join('/')}: ${message}`;
    }

    if (lineNumber) {
      lineMessages.push({
        lineNumber: lineNumber,
        message,
      });
    } else {
      generalMessages.push({
        message,
      });
    }
  });

  return {lineMessages, generalMessages};
}

module.exports = StructuredDataAutomatic;
module.exports.UIStrings = UIStrings;
