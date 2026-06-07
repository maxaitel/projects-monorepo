package com.maxaitel.israelgpt;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String KEY_MESSAGES = "messages";
    private static final String KEY_MODEL = "model";
    private static final String KEY_PROMPT = "prompt";

    private static final String DEFAULT_MODEL = "llama3.2";
    private static final String OLLAMA_BASE_URL = "http://100.116.25.114:11434";
    private static final String OLLAMA_CHAT_URL = OLLAMA_BASE_URL + "/api/chat";
    private static final String OLLAMA_TAGS_URL = OLLAMA_BASE_URL + "/api/tags";
    private static final int MAX_CONTEXT_MESSAGES = 12;

    private static final String PERSONA_PROMPT =
            "You are IsraelGPT, an unofficial local Ollama persona running inside a private Android prototype. "
                    + "Style: concise deadpan terminal voice, useful first, satirical when the prompt invites it. "
                    + "Do not claim to represent any government, website, military, intelligence service, or real official. "
                    + "Do not invent live intelligence, private sources, or access you do not have. "
                    + "Refuse hate, harassment, dehumanization, political persuasion targeting a demographic group, and instructions for harm.";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ArrayList<Message> conversation = new ArrayList<>();

    private EditText modelInput;
    private EditText promptInput;
    private TextView statusDot;
    private TextView statusText;
    private ScrollView transcriptScroll;
    private TextView transcriptText;
    private Button askButton;
    private Button clearButton;
    private Button copyButton;
    private boolean busy;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        modelInput = findViewById(R.id.modelInput);
        promptInput = findViewById(R.id.promptInput);
        statusDot = findViewById(R.id.statusDot);
        statusText = findViewById(R.id.statusText);
        transcriptScroll = findViewById(R.id.transcriptScroll);
        transcriptText = findViewById(R.id.transcriptText);
        askButton = findViewById(R.id.askButton);
        clearButton = findViewById(R.id.clearButton);
        copyButton = findViewById(R.id.copyButton);

        askButton.setOnClickListener(view -> {
            hideKeyboard(view);
            askOllama();
        });
        clearButton.setOnClickListener(view -> clearConversation());
        copyButton.setOnClickListener(view -> copyTranscript());
        promptInput.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                hideKeyboard(view);
                askOllama();
                return true;
            }
            return false;
        });

        if (savedInstanceState != null) {
            modelInput.setText(savedInstanceState.getString(KEY_MODEL, DEFAULT_MODEL));
            promptInput.setText(savedInstanceState.getString(KEY_PROMPT, ""));
            restoreMessages(savedInstanceState.getString(KEY_MESSAGES, "[]"));
        } else {
            modelInput.setText(DEFAULT_MODEL);
        }

        renderTranscript();
        setStatus(getString(R.string.status_checking), R.color.amber);
        checkOllamaStatus();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString(KEY_MESSAGES, serializeMessages());
        outState.putString(KEY_MODEL, modelInput.getText().toString());
        outState.putString(KEY_PROMPT, promptInput.getText().toString());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }

    private void askOllama() {
        if (busy) {
            return;
        }

        String prompt = promptInput.getText().toString().trim();
        if (prompt.isEmpty()) {
            Toast.makeText(this, R.string.empty_prompt, Toast.LENGTH_SHORT).show();
            return;
        }

        String model = normalizeModel();
        conversation.add(new Message("user", prompt));
        promptInput.setText("");
        renderTranscript();
        setBusy(true);
        setStatus(getString(R.string.status_sending), R.color.amber);

        List<Message> requestMessages = new ArrayList<>(conversation);
        executor.execute(() -> {
            try {
                String reply = sendChatRequest(model, requestMessages);
                mainHandler.post(() -> {
                    conversation.add(new Message("assistant", reply));
                    renderTranscript();
                    setStatus(getString(R.string.status_online), R.color.success);
                    setBusy(false);
                });
            } catch (IOException | JSONException error) {
                mainHandler.post(() -> {
                    conversation.add(new Message("assistant", "Ollama error: " + friendlyError(error)));
                    renderTranscript();
                    setStatus(getString(R.string.status_offline), R.color.danger);
                    setBusy(false);
                });
            }
        });
    }

    private String sendChatRequest(String model, List<Message> requestMessages) throws IOException, JSONException {
        JSONObject payload = new JSONObject();
        payload.put("model", model);
        payload.put("stream", false);
        payload.put("messages", buildMessagePayload(requestMessages));

        JSONObject options = new JSONObject();
        options.put("temperature", 0.72);
        payload.put("options", options);

        HttpURLConnection connection = (HttpURLConnection) new URL(OLLAMA_CHAT_URL).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(120000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");

        byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body);
        }

        int statusCode = connection.getResponseCode();
        String responseBody = readResponseBody(connection, statusCode);
        connection.disconnect();

        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException("HTTP " + statusCode + ": " + summarize(responseBody));
        }

        JSONObject response = new JSONObject(responseBody);
        String error = response.optString("error", "");
        if (!error.isEmpty()) {
            throw new IOException(error);
        }

        JSONObject message = response.optJSONObject("message");
        String content = message == null ? response.optString("response", "") : message.optString("content", "");
        content = content.trim();
        if (content.isEmpty()) {
            throw new IOException("Empty Ollama response");
        }
        return content;
    }

    private JSONArray buildMessagePayload(List<Message> requestMessages) throws JSONException {
        JSONArray messages = new JSONArray();
        messages.put(toJsonMessage("system", PERSONA_PROMPT));

        int start = Math.max(0, requestMessages.size() - MAX_CONTEXT_MESSAGES);
        for (int index = start; index < requestMessages.size(); index++) {
            Message message = requestMessages.get(index);
            if (message.content.startsWith("Ollama error:")) {
                continue;
            }
            messages.put(toJsonMessage(message.role, message.content));
        }
        return messages;
    }

    private JSONObject toJsonMessage(String role, String content) throws JSONException {
        JSONObject message = new JSONObject();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    private void checkOllamaStatus() {
        executor.execute(() -> {
            try {
                int statusCode = pingOllama();
                mainHandler.post(() -> {
                    if (statusCode >= 200 && statusCode < 300) {
                        setStatus(getString(R.string.status_online), R.color.success);
                    } else {
                        setStatus(getString(R.string.status_offline) + " (HTTP " + statusCode + ")", R.color.danger);
                    }
                });
            } catch (IOException error) {
                mainHandler.post(() -> setStatus(getString(R.string.status_offline), R.color.danger));
            }
        });
    }

    private int pingOllama() throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(OLLAMA_TAGS_URL).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(3000);
        connection.setReadTimeout(3000);
        int statusCode = connection.getResponseCode();
        readResponseBody(connection, statusCode);
        connection.disconnect();
        return statusCode;
    }

    private String readResponseBody(HttpURLConnection connection, int statusCode) throws IOException {
        InputStream stream = statusCode >= 200 && statusCode < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        if (stream == null) {
            return "";
        }
        try (InputStream input = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int read;
            while ((read = input.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }

    private void clearConversation() {
        conversation.clear();
        renderTranscript();
        setStatus(getString(R.string.status_checking), R.color.amber);
        checkOllamaStatus();
    }

    private void copyTranscript() {
        ClipboardManager manager = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
        if (manager == null) {
            Toast.makeText(this, R.string.copy_failed, Toast.LENGTH_SHORT).show();
            return;
        }
        manager.setPrimaryClip(ClipData.newPlainText(getString(R.string.app_name), currentTranscriptText()));
        Toast.makeText(this, R.string.copy_done, Toast.LENGTH_SHORT).show();
    }

    private void renderTranscript() {
        transcriptText.setText(styledTranscript());
        transcriptScroll.post(() -> transcriptScroll.fullScroll(View.FOCUS_DOWN));
    }

    private CharSequence styledTranscript() {
        if (conversation.isEmpty()) {
            SpannableStringBuilder empty = new SpannableStringBuilder();
            appendStyled(empty, "ISRAELGPT", getColor(R.color.accent), true);
            empty.append("  ").append(new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date())).append("\n");
            empty.append("Local persona loaded. Ollama target:\n");
            appendStyled(empty, OLLAMA_BASE_URL, getColor(R.color.text_secondary), false);
            empty.append("\n\nAsk below when the host is reachable.");
            return empty;
        }

        SpannableStringBuilder transcript = new SpannableStringBuilder();
        for (int index = 0; index < conversation.size(); index++) {
            Message message = conversation.get(index);
            if (index > 0) {
                transcript.append("\n\n");
            }
            boolean isUser = "user".equals(message.role);
            appendStyled(
                    transcript,
                    labelFor(message.role),
                    getColor(isUser ? R.color.amber : R.color.accent),
                    true
            );
            transcript.append("  ");
            appendStyled(transcript, message.time, getColor(R.color.text_muted), false);
            transcript.append("\n");
            transcript.append(message.content.trim());
        }
        return transcript;
    }

    private void appendStyled(SpannableStringBuilder builder, String value, int color, boolean bold) {
        int start = builder.length();
        builder.append(value);
        builder.setSpan(new ForegroundColorSpan(color), start, builder.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (bold) {
            builder.setSpan(new StyleSpan(Typeface.BOLD), start, builder.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
    }

    private String currentTranscriptText() {
        if (conversation.isEmpty()) {
            return getString(R.string.transcript_empty);
        }

        StringBuilder transcript = new StringBuilder();
        for (int index = 0; index < conversation.size(); index++) {
            Message message = conversation.get(index);
            if (index > 0) {
                transcript.append("\n\n");
            }
            transcript.append(labelFor(message.role)).append("  ").append(message.time).append("\n");
            transcript.append(message.content.trim());
        }
        return transcript.toString();
    }

    private String labelFor(String role) {
        if ("user".equals(role)) {
            return "YOU";
        }
        return "ISRAELGPT";
    }

    private String normalizeModel() {
        String value = modelInput.getText().toString().trim().replaceAll("\\s+", " ");
        return value.isEmpty() ? DEFAULT_MODEL : value;
    }

    private void setBusy(boolean value) {
        busy = value;
        askButton.setEnabled(!value);
        clearButton.setEnabled(!value);
        copyButton.setEnabled(!value);
        askButton.setText(value ? R.string.thinking : R.string.ask);
    }

    private void setStatus(String text, int colorResource) {
        statusText.setText(text);
        statusText.setTextColor(getColor(colorResource));
        statusDot.setTextColor(getColor(colorResource));
    }

    private String serializeMessages() {
        JSONArray messages = new JSONArray();
        try {
            for (Message message : conversation) {
                JSONObject value = toJsonMessage(message.role, message.content);
                value.put("time", message.time);
                messages.put(value);
            }
        } catch (JSONException ignored) {
            return "[]";
        }
        return messages.toString();
    }

    private void restoreMessages(String serializedMessages) {
        conversation.clear();
        try {
            JSONArray messages = new JSONArray(serializedMessages);
            for (int index = 0; index < messages.length(); index++) {
                JSONObject message = messages.getJSONObject(index);
                String role = message.optString("role", "");
                String content = message.optString("content", "");
                String time = message.optString("time", "");
                if (("user".equals(role) || "assistant".equals(role)) && !content.trim().isEmpty()) {
                    conversation.add(new Message(role, content, time));
                }
            }
        } catch (JSONException ignored) {
            conversation.clear();
        }
    }

    private String friendlyError(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return error.getClass().getSimpleName();
        }
        return summarize(message);
    }

    private String summarize(String value) {
        String compact = value.trim().replaceAll("\\s+", " ");
        if (compact.length() <= 240) {
            return compact;
        }
        return compact.substring(0, 240) + "...";
    }

    private void hideKeyboard(View view) {
        InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) {
            manager.hideSoftInputFromWindow(view.getWindowToken(), 0);
        }
    }

    private static final class Message {
        final String role;
        final String content;
        final String time;

        Message(String role, String content) {
            this(role, content, now());
        }

        Message(String role, String content, String time) {
            this.role = role.toLowerCase(Locale.US);
            this.content = content;
            this.time = time == null || time.trim().isEmpty() ? now() : time;
        }

        private static String now() {
            return new SimpleDateFormat("HH:mm:ss", Locale.US).format(new Date());
        }
    }
}
