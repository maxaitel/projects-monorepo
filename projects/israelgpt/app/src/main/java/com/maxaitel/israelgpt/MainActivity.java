package com.maxaitel.israelgpt;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;
import java.util.Random;

public final class MainActivity extends Activity {
    private static final String KEY_OUTPUT = "output";
    private static final String KEY_CATEGORY = "category";
    private static final String KEY_CONSTRAINT = "constraint";
    private static final String KEY_RESULT = "result";

    private static final String[] CATEGORIES = {
            "album", "mobile game", "anime arc", "startup name", "coffee shop",
            "basketball team", "movie sequel", "podcast", "energy drink", "font"
    };

    private static final String[] CONSTRAINTS = {
            "a group chat will instantly argue about",
            "sounds focus-tested by a panic room",
            "gets recommended by one too many reply guys",
            "feels like a board meeting became sentient",
            "would trend for the wrong reason before lunch",
            "turns every fandom thread into paperwork"
    };

    private static final String[] RESULTS = {
            "Compliance Funk", "The Final Drafts", "Blue Check Summer",
            "Inbox Zero Ultra", "The Neutral Zone", "Focus Group Eternal",
            "Spreadsheet Deluxe", "Reply All Protocol"
    };

    private final Random random = new Random();
    private EditText categoryInput;
    private EditText constraintInput;
    private EditText resultInput;
    private TextView outputText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        categoryInput = findViewById(R.id.categoryInput);
        constraintInput = findViewById(R.id.constraintInput);
        resultInput = findViewById(R.id.resultInput);
        outputText = findViewById(R.id.outputText);

        Button generateButton = findViewById(R.id.generateButton);
        Button randomButton = findViewById(R.id.randomButton);
        Button copyButton = findViewById(R.id.copyButton);
        Button shareButton = findViewById(R.id.shareButton);

        generateButton.setOnClickListener(view -> {
            hideKeyboard(view);
            generateFromInputs();
        });
        randomButton.setOnClickListener(view -> {
            hideKeyboard(view);
            fillRandomPrompt();
            generateFromInputs();
        });
        copyButton.setOnClickListener(view -> copyOutput());
        shareButton.setOnClickListener(view -> shareOutput());

        if (savedInstanceState == null) {
            fillRandomPrompt();
            generateFromInputs();
        } else {
            categoryInput.setText(savedInstanceState.getString(KEY_CATEGORY, ""));
            constraintInput.setText(savedInstanceState.getString(KEY_CONSTRAINT, ""));
            resultInput.setText(savedInstanceState.getString(KEY_RESULT, ""));
            outputText.setText(savedInstanceState.getString(KEY_OUTPUT, ""));
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(KEY_CATEGORY, categoryInput.getText().toString());
        outState.putString(KEY_CONSTRAINT, constraintInput.getText().toString());
        outState.putString(KEY_RESULT, resultInput.getText().toString());
        outState.putString(KEY_OUTPUT, outputText.getText().toString());
    }

    private void fillRandomPrompt() {
        categoryInput.setText(pick(CATEGORIES));
        constraintInput.setText(pick(CONSTRAINTS));
        resultInput.setText(pick(RESULTS));
    }

    private void generateFromInputs() {
        String category = normalize(categoryInput, "piece of media").toLowerCase(Locale.US);
        String constraint = normalize(constraintInput, "people will debate forever");
        String result = normalize(resultInput, "Untitled Discourse Object");
        outputText.setText(formatMeme(category, constraint, result));
    }

    private String formatMeme(String category, String constraint, String result) {
        return "- IsraelGPT please generate me a " + category + " that " + constraint
                + "\n\nBZZT BZZT\nYour next " + category + " will be called...\n\n" + result;
    }

    private String normalize(EditText input, String fallback) {
        String value = input.getText().toString().trim().replaceAll("\\s+", " ");
        return value.isEmpty() ? fallback : value;
    }

    private String pick(String[] values) {
        return values[random.nextInt(values.length)];
    }

    private void copyOutput() {
        ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (manager == null) {
            Toast.makeText(this, R.string.copy_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        manager.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), outputText.getText()));
        Toast.makeText(this, R.string.copy_done, Toast.LENGTH_SHORT).show();
    }

    private void shareOutput() {
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_TEXT, outputText.getText().toString());
        startActivity(Intent.createChooser(sendIntent, getString(R.string.share_title)));
    }

    private void hideKeyboard(View view) {
        InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) {
            manager.hideSoftInputFromWindow(view.getWindowToken(), 0);
        }
    }
}
