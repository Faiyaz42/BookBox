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
// https://stackoverflow.com/questions/43567312/how-do-i-get-the-server-timestamp-in-cloud-functions-for-firebase
// The code for dealing with notification tokens comes from this example

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
 * Users save their device notification tokens to `/USERS/{UserID}/NOTIFICATION_TOKENs/{token}`.
 */
// ` <========== USER THIS QUOTE WHEN ACCESSING VARIABLES IN STRINGS
exports.sendRequestNotification = functions.firestore.document('/REQUESTS/{RequestID}')
  .onCreate(async (snap, context) => {

  const data = snap.data();
  const bookOwnerUid = data.OWNER;
  const requesterUid = data.BORROWER;
  const bookID = data.BOOK;
  const bookTitle = (await admin.firestore().collection('BOOKS').doc(bookID).get()).data().TITLE;

  // Notification details.
  const payload = {
    notification: {
      title: 'Book Requested',
      body: `${requesterUid} has requested ${bookTitle}!`
    }
  };

  // we also want to create a NOTIFICATION entry for the book owner
  admin.firestore().collection('USERS').doc(bookOwnerUid).collection('NOTIFICATIONS')
    .add( {TYPE: "BOOK REQUEST", 
          BOOK: bookID, 
          USER: requesterUid, 
          REQUEST_ID: context.params.RequestID, 
          DATE: admin.firestore.FieldValue.serverTimestamp()});

  // The snapshot to the user's tokens.
  const tokenReference = admin.firestore().collection('USERS').doc(`${bookOwnerUid}`).collection('TOKENS');

  // try and send a notification for each token
  tokenReference.get()
  .then(snapshot => {
      snapshot.forEach(doc => {
        let token = doc.data().VALUE;
        admin.messaging().sendToDevice(token, payload)
          .then((response) => {
            // Response is a message ID string.
            console.log('Successfully sent message:', response);
            return null;
          })
          .catch((error) => {
            console.log('Error sending message:', error);
            // Cleanup the tokens who are not registered anymore.
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                tokenDoc.delete();
            }
          });
      });
      return null;
  })
  .catch(err => {
      console.log('Error getting documents', err);
  });
});


  /**
   * Triggers when a request is updated
   * 
   * We are specifically paying attention to the IS_ACCEPTED field
   * When it changes to 'true' then we send a notification to the borrower
   */
exports.sendAcceptedRequestNotification = functions.firestore.document('/REQUESTS/{RequestID}')
  .onUpdate(async (snap, context) => {
  
  const data = snap.after.data();
  const before_status = snap.before.data().IS_ACCEPTED;
  const after_status = data.IS_ACCEPTED;
  if (before_status === 'false' && after_status === 'true') {
    const bookOwnerUid = data.OWNER;
    const requesterUid = data.BORROWER;
    const bookID = data.BOOK;
    const bookTitle = (await admin.firestore().collection('BOOKS').doc(bookID).get()).data().TITLE;

    // Send notifications to token.

    const payload = {
      notification: {
        title: 'Request Accepted',
        body: `${bookOwnerUid} has accepted your request on ${bookTitle}!`
      }
    };

    // we also want to create a NOTIFICATION entry for the requester
    admin.firestore().collection('USERS').doc(requesterUid).collection('NOTIFICATIONS')
      .add( {TYPE: "ACCEPT REQUEST", 
            BOOK: bookID, 
            USER: bookOwnerUid, 
            DATE: admin.firestore.FieldValue.serverTimestamp(),
            REQUEST_ID: context.params.RequestID});

    // The snapshot to the requesters's tokens.
    const tokenReference = admin.firestore().collection('USERS').doc(`${requesterUid}`).collection('TOKENS');

    // try and send a notification for each token
    tokenReference.get()
    .then(snapshot => {
        snapshot.forEach(doc => {
          let token = doc.data().VALUE;
          admin.messaging().sendToDevice(token, payload)
            .then((response) => {
              // Response is a message ID string.
              console.log('Successfully sent message:', response);
              return null;
            })
            .catch((error) => {
              console.log('Error sending message:', error);
              // Cleanup the tokens who are not registered anymore.
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                  tokenDoc.delete();
              }
            });
        });
        return null;
    })
    .catch(err => {
        console.log('Error getting documents', err);
    });
  }
});

/**
 * Triggers when a book is updated
 * 
 * We are specifically looking for the STATUS to change from BORROWED to AVAILABLE (69 to 66)
 * When this occurs we send a notification to the owner
 */
exports.sendReturnBookNotification = functions.firestore.document('/BOOKS/{BookID}')
  .onUpdate(async (snap, context) => {
  
  const data = snap.after.data();
  const before_status = snap.before.data().STATUS;
  const after_status = data.STATUS;
  if (before_status === '69' && after_status === '66') {
    const bookOwnerUid = data.OWNER;
    const requesterUid = data.LENT_TO;
    const bookTitle = data.TITLE;

    // Send notifications to token.

    const payload = {
      notification: {
        title: `Book Return`,
        body: `${requesterUid} would like to return ${bookTitle}!`
      }
    };

    // we also want to create a NOTIFICATION entry for the owner -- we need to get the request id
    const requestSnapshot = await admin.firestore().collection('REQUESTS').where("BOOK", '==', context.params.BookID).get();
    
    // should only be one result
    if (requestSnapshot.size !== 1) {
      console.log("An Error Occurred: There are", requestSnapshot.size, "requests with", BookID);
    } else {
      requestSnapshot.forEach(doc => {
        admin.firestore().collection('USERS').doc(bookOwnerUid).collection('NOTIFICATIONS')
          .add( {TYPE: "RETURN", 
              BOOK: context.params.BookID, 
              USER: requesterUid, 
              REQUEST_ID: doc.id,
              DATE: admin.firestore.FieldValue.serverTimestamp()});
      })
    }

    // The snapshot to the user's tokens.
    const tokenReference = admin.firestore().collection('USERS').doc(`${bookOwnerUid}`).collection('TOKENS');

    // try and send a notification for each token
    tokenReference.get()
    .then(snapshot => {
        snapshot.forEach(doc => {
          let token = doc.data().VALUE;
          admin.messaging().sendToDevice(token, payload)
            .then((response) => {
              // Response is a message ID string.
              console.log('Successfully sent message:', response);
              return null;
            })
            .catch((error) => {
              console.log('Error sending message:', error);
              // Cleanup the tokens who are not registered anymore.
              if (error.code === 'messaging/invalid-registration-token' ||
                  error.code === 'messaging/registration-token-not-registered') {
                  tokenDoc.delete();
              }
            });
        });
        return null;
    })
    .catch(err => {
        console.log('Error getting documents', err);
    });
  }
});

/**
 * Triggers when a request is deleted
 * 
 * We are specifically paying attention to deleted requests that have not been accepted
 * This have been declined so we send a notification to the BORROWER that their request
 * was declined
 */
exports.sendDeclinedRequestNotification = functions.firestore.document('/REQUESTS/{RequestID}')
  .onDelete(async (snap, context) => {
    const data = snap.data();
    const requester = data.BORROWER;
    const bookID = data.BOOK;
    const status = data.IS_ACCEPTED;
    const owner = data.OWNER;
    const bookTitle = (await admin.firestore().collection('BOOKS').doc(bookID).get()).data().TITLE;
    if (status === 'false') { // send declined notification
      const payload = {
        notification: {
          title: `Request Declined`,
          body: `${owner} has declined your request on ${bookTitle}!`
        }
      };

      /*
      // we also want to create a NOTIFICATION entry for the requester
      admin.firestore().collection('USERS').doc(requesterUid).collection('NOTIFICATIONS')
      .add( {TYPE: "REQUEST DECLINED", 
            BOOK: bookID, 
            USER: bookOwnerUid, 
            DATE: admin.firestore.FieldValue.serverTimestamp()});
      */
      // The snapshot to the requesters's tokens.
      const tokenReference = admin.firestore().collection('USERS').doc(`${requester}`).collection('TOKENS');

      // try and send a notification for each token
      tokenReference.get()
      .then(snapshot => {
          snapshot.forEach(doc => {
            let token = doc.data().VALUE;
            admin.messaging().sendToDevice(token, payload)
              .then((response) => {
                // Response is a message ID string.
                console.log('Successfully sent message:', response);
                return null;
              })
              .catch((error) => {
                console.log('Error sending message:', error);
                // Cleanup the tokens who are not registered anymore.
                if (error.code === 'messaging/invalid-registration-token' ||
                    error.code === 'messaging/registration-token-not-registered') {
                    tokenDoc.delete();
                }
              });
          });
          return null;
      })
      .catch(err => {
          console.log('Error getting documents', err);
      });
    }
  })