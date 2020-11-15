/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// https://firebase.google.com/docs/functions/get-started?authuser=0
// https://github.com/firebase/functions-samples/blob/master/fcm-notifications/functions/index.js

// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Cloud Firestore.
const admin = require('firebase-admin');
const { firestore } = require('firebase-admin');
admin.initializeApp();

/**
 * Triggers when a user gets a new request and sends a notification.
 *
 * Requests are added to REQUESTS/{RequestID}
 * Users save their device notification tokens to `/USERS/{UserID}/NOTIFICATION_TOKEN/{token}`.
 */
// ` <========== USER THIS QUOTE WHEN ACCESSING VARIABLES IN STRINGS
exports.sendRequestNotification = functions.firestore.document('/REQUESTS/{RequestID}')
  .onCreate(async (snap, context) => {
    const data = snap.data();

    const bookOwnerUid = data.OWNER;
    const requesterUid = data.BORROWER;
    const bookID = data.ID;
    const bookTitle = (await admin.firestore().collection('BOOKS').doc(bookID).get()).data().TITLE;
    const token = (await admin.firestore().collection('USERS').doc(bookOwnerUid).get()).data().NOTIFICATION_TOKEN;

    // Notification details.
    const payload = {
      notification: {
        title: 'Book Requested',
        body: `${requesterUid} has requested ${bookTitle}!`
      }
    };

    // Send notifications to token.
    admin.messaging().sendToDevice(token, payload);

    // we also want to create a NOTIFICATION entry for the book owner
    admin.firestore().collection('USERS').doc(bookOwnerUid).collection('NOTIFICATIONS')
      .add( {TYPE: "BOOK REQUEST", BOOK: bookID, USER: requesterUid});
  });


  /**
   * Triggers when a book is updated
   * 
   * We are specifically paying attention to the STATUS field
   * When it changes to ACCEPTED (68) then we send a notificatino to the borrower
   */
exports.sendAcceptedRequestNotification = functions.firestore.document('/BOOKS/{BookID}')
  .onUpdate(async (snap, context) => {
    const data = snap.after.data();
    const before_status = snap.before.data().STATUS;
    const after_status = data.STATUS;
    if (before_status !== '68' && after_status === '68') {
      const bookOwnerUid = data.OWNER;
      const requesterUid = data.LENT_TO;
      const bookTitle = data.TITLE;

      const token = (await admin.firestore().collection('USERS').doc(requesterUid).get()).data().NOTIFICATION_TOKEN;

    // Send notifications to token.

    const payload = {
      notification: {
        title: 'Request Accepted',
        body: `${bookOwnerUid} has accepted your request on ${bookTitle}!`
      }
    };

    admin.messaging().sendToDevice(token, payload);  

    // we also want to create a NOTIFICATION entry for the requester
    admin.firestore().collection('USERS').doc(requesterUid).collection('NOTIFICATIONS')
      .add( {TYPE: "ACCEPT REQUEST", BOOK: context.params.BookID, USER: bookOwnerUid});

    }
  });