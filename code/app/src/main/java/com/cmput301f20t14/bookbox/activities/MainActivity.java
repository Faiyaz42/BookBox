package com.cmput301f20t14.bookbox.activities;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import com.cmput301f20t14.bookbox.R;
import com.cmput301f20t14.bookbox.entities.User;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.AuthResult;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.HashMap;
import java.util.Objects;

/**
 * This is the initial activity that shows a login screen and allows
 * for user registration (RegisterUserActivity). Upon success, retrieves
 * user data and opens main menu (HomeActivity)
 * @author Carter Sabadash
 * @author Olivier Vadiavaloo
 * @version 2020.10.25
 */
public class MainActivity extends AppCompatActivity {
    EditText usernameEditText;
    EditText passwordEditText;
    FirebaseFirestore database;
    final String TAG = "LOGIN";
    public final int REQUEST_CODE_REGISTER = 1;
    private FirebaseAuth mAuth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        database = FirebaseFirestore.getInstance();
        mAuth = FirebaseAuth.getInstance();

        // Check if user is signed in (non-null) and update UI accordingly.
        // FirebaseAuth.getInstance().signOut(); // figure out how to do this properly
        FirebaseUser currentUser = mAuth.getCurrentUser();

        if (currentUser != null) {
            // start main activity
            login(currentUser.getDisplayName());
        }

        usernameEditText = (EditText) findViewById(R.id.username_editText);
        passwordEditText = (EditText) findViewById(R.id.password_editText);

        Button createUserButton = findViewById(R.id.register_button);
        final Button loginButton = findViewById(R.id.login_button);

        createUserButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                // Open RegisterUser activity
                Intent intent = new Intent(view.getContext(), RegisterUserActivity.class);
                view.getContext().startActivity(intent);
            }
        });


        // setting listener for login button
        loginButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(final View view) {
                loginButton.setText(R.string.login_verify);

                final String username = usernameEditText.getText().toString();
                final String password = passwordEditText.getText().toString();

                attemptLogin(view, username, password);
                loginButton.setText(R.string.log_in_button);
            }
        });

        createUserButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                register(v);
            }
        });
    }

    /**
     * Verifies the user and password, if the user and password is correct, go to HomeActivity
     * if it is incorrect, show appropriate error and return
     * @param view The view
     * @param username The entered username
     * @param password The entered password
     */
    private void attemptLogin(final View view, final String username, final String password) {
        boolean isEmptyEditText = false;

        if (username.length() == 0) {
            usernameEditText.setError("Required");
            usernameEditText.requestFocus();
            isEmptyEditText = true;
        }

        if (password.length() == 0) {
            passwordEditText.setError("Required");
            passwordEditText.requestFocus();
            isEmptyEditText = true;
        }

        if (isEmptyEditText) {
            return;
        }

        mAuth.signInWithEmailAndPassword(username, password)
                .addOnCompleteListener(this, new OnCompleteListener<AuthResult>() {
                    @Override
                    public void onComplete(@NonNull Task<AuthResult> task) {
                        if (task.isSuccessful()) {
                            Button loginButton = findViewById(R.id.login_button);
                            loginButton.setText(R.string.login_login);
                            login(mAuth.getCurrentUser().getDisplayName());
                        } else {
                            // email or password is incorrect; we cant determine which from the task
                            passwordEditText.setError("Email or Password is Incorrect!");
                            passwordEditText.setText("");
                            passwordEditText.requestFocus();

                            usernameEditText.setError("Email or password is Incorrect!");
                            usernameEditText.requestFocus();
                        }
                    }
                });
    }

    /**
     * Starts HomeActivity and updates the device token in the database so that it's always up to date
     * @param username The Users username
     */
    private void login(final String username){
        Button login = findViewById(R.id.login_button);
        login.setText(R.string.login_login);

        addToken(username);

        Intent intent = new Intent(this, HomeActivity.class);
        intent.putExtra(User.USERNAME, username);
        startActivity(intent);
        finish();
    }

    /**
     * This adds the device token to the list of tokens for the user if it has not already been
     * added. This is necessary to receive notifications
     * @param username The username (displayName) of the user
     */
    void addToken(final String username){
        // get the token; it is necessary to get the token here if the user is switching devices
        // logging for the first time (we don't know -> always update it)
        FirebaseMessaging.getInstance().getToken()
                .addOnCompleteListener(new OnCompleteListener<String>() {
                    @Override
                    public void onComplete(@NonNull Task<String> task) {
                        if (!task.isSuccessful()) {
                            // we'll try again on the next login
                            Log.w(TAG, "Fetching FCM registration token failed", task.getException());
                            return;
                        }

                        // Get new FCM registration token
                        final String token = task.getResult();

                        // update in the database, we can overwrite any existing documents
                        // they have the same content
                        HashMap<String, String> tokenInfo = new HashMap<>();
                        tokenInfo.put("VALUE", token);
                        database.collection(User.USERS).document(username)
                                .collection("TOKENS").document(token).set(tokenInfo);
                    }
                });
    }

    /**
     * This method starts the RegisterUserActivity
     * @param view The view used in MainActivity
     */
    private void register(View view) {
        // launches the RegisterUserActivity

        Intent intent = new Intent(view.getContext(), RegisterUserActivity.class);
        startActivityForResult(intent, REQUEST_CODE_REGISTER);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        // If the register activity was successful, then login and finish this
        // activity to prevent user from going back to the login activity
        if (requestCode == REQUEST_CODE_REGISTER && resultCode == CommonStatusCodes.SUCCESS) {
            login(Objects.requireNonNull(FirebaseAuth.getInstance().getCurrentUser()).getDisplayName());
        }
    }
}