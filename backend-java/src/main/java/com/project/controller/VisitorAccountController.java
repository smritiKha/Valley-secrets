package com.project.controller;

import com.project.model.VisitorAccount;
import com.project.repository.PlaceRepository;
import com.project.repository.VisitorAccountRepository;
import com.project.service.VisitorAccountService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/visitor-auth")
@CrossOrigin(origins = "*")
public class VisitorAccountController {
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final int PASSWORD_ITERATIONS = 210_000;
    private static final int PASSWORD_SALT_BYTES = 16;
    private static final int SESSION_TOKEN_BYTES = 32;

    private final VisitorAccountRepository accountRepository;
    private final PlaceRepository placeRepository;
    private final VisitorAccountService accountService;

    public VisitorAccountController(
            VisitorAccountRepository accountRepository,
            PlaceRepository placeRepository,
            VisitorAccountService accountService) {
        this.accountRepository = accountRepository;
        this.placeRepository = placeRepository;
        this.accountService = accountService;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody AccountRequest request) {
        String email = normalizeEmail(request == null ? null : request.email());
        String password = request == null ? null : request.password();
        String username = request == null || request.username() == null ? "" : request.username().trim();
        if (!isValidEmail(email)) {
            return ResponseEntity.badRequest().body("Enter a valid email address.");
        }
        if (username.isEmpty() || username.length() > 80) {
            return ResponseEntity.badRequest().body("Username must be between 1 and 80 characters.");
        }
        if (!isValidPassword(password)) {
            return ResponseEntity.badRequest().body("Password must be between 8 and 128 characters.");
        }
        if (accountRepository.findByEmail(email).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body("An account with this email already exists.");
        }

        VisitorAccount account = new VisitorAccount();
        account.setEmail(email);
        account.setUsername(username);
        account.setPasswordHash(hashPassword(password));
        return ResponseEntity.status(HttpStatus.CREATED).body(createSession(accountRepository.save(account)));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AccountRequest request) {
        String email = normalizeEmail(request == null ? null : request.email());
        String password = request == null ? null : request.password();
        if (!isValidEmail(email) || password == null || password.length() > 128) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Email or password is incorrect.");
        }
        VisitorAccount account = accountRepository.findByEmail(email).orElse(null);
        if (account == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("No account exists for this email.");
        }
        if (!passwordMatches(password, account.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Email or password is incorrect.");
        }
        return ResponseEntity.ok(createSession(account));
    }

    @GetMapping("/me")
    public ResponseEntity<?> currentAccount(
            @RequestHeader(value = "X-Visitor-Token", required = false) String token) {
        return accountService.findByToken(token)
                .<ResponseEntity<?>>map(account -> ResponseEntity.ok(new AccountResponse(
                        account.getEmail(), displayUsername(account))))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in to continue."));
    }

    @DeleteMapping("/session")
    @Transactional
    public ResponseEntity<?> logout(@RequestHeader(value = "X-Visitor-Token", required = false) String token) {
        return accountService.findByToken(token)
                .map(account -> {
                    account.setSessionTokenHash(null);
                    account.setSessionExpiresAt(null);
                    accountRepository.save(account);
                    return ResponseEntity.noContent().build();
                })
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/favorites")
    public ResponseEntity<?> getFavorites(@RequestHeader(value = "X-Visitor-Token", required = false) String token) {
        return accountService.findByToken(token)
                .<ResponseEntity<?>>map(account -> ResponseEntity.ok(account.getFavoritePlaceIds()))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in to sync saved places."));
    }

    @PutMapping("/favorites")
    @Transactional
    public ResponseEntity<?> saveFavorites(
            @RequestHeader(value = "X-Visitor-Token", required = false) String token,
            @RequestBody FavoriteRequest request) {
        VisitorAccount account = accountService.findByToken(token).orElse(null);
        if (account == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in to sync saved places.");
        }
        if (request == null || request.placeIds() == null || request.placeIds().size() > 500
                || request.placeIds().stream().anyMatch(id -> id == null || id < 1)) {
            return ResponseEntity.badRequest().body("Saved places list is invalid.");
        }
        Set<Long> uniqueIds = new HashSet<>(request.placeIds());
        if (!placeRepository.findAllById(uniqueIds).stream().map(place -> place.getId()).collect(java.util.stream.Collectors.toSet())
                .equals(uniqueIds)) {
            return ResponseEntity.badRequest().body("One or more saved places do not exist.");
        }
        account.setFavoritePlaceIds(uniqueIds);
        accountRepository.save(account);
        return ResponseEntity.ok(uniqueIds);
    }

    private SessionResponse createSession(VisitorAccount account) {
        byte[] tokenBytes = new byte[SESSION_TOKEN_BYTES];
        SECURE_RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        account.setSessionTokenHash(VisitorAccountService.hashToken(token));
        account.setSessionExpiresAt(Instant.now().plus(30, ChronoUnit.DAYS));
        accountRepository.save(account);
        return new SessionResponse(token, account.getEmail(), displayUsername(account));
    }

    private static String displayUsername(VisitorAccount account) {
        return account.getUsername() == null || account.getUsername().isBlank()
                ? account.getEmail().substring(0, account.getEmail().indexOf('@'))
                : account.getUsername();
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static boolean isValidEmail(String email) {
        return email.length() <= 254 && EMAIL_PATTERN.matcher(email).matches();
    }

    private static boolean isValidPassword(String password) {
        return password != null && password.length() >= 8 && password.length() <= 128;
    }

    private static String hashPassword(String password) {
        byte[] salt = new byte[PASSWORD_SALT_BYTES];
        SECURE_RANDOM.nextBytes(salt);
        byte[] derivedKey = derivePasswordKey(password, salt);
        return Base64.getEncoder().encodeToString(salt) + ":" + Base64.getEncoder().encodeToString(derivedKey);
    }

    private static boolean passwordMatches(String password, String storedHash) {
        String[] parts = storedHash.split(":", -1);
        if (parts.length != 2) return false;
        try {
            byte[] salt = Base64.getDecoder().decode(parts[0]);
            byte[] expected = Base64.getDecoder().decode(parts[1]);
            byte[] actual = derivePasswordKey(password, salt);
            return MessageDigest.isEqual(expected, actual);
        } catch (IllegalArgumentException malformedHash) {
            return false;
        }
    }

    private static byte[] derivePasswordKey(String password, byte[] salt) {
        try {
            javax.crypto.spec.PBEKeySpec spec = new javax.crypto.spec.PBEKeySpec(
                    password.toCharArray(), salt, PASSWORD_ITERATIONS, 256);
            try {
                return javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                        .generateSecret(spec).getEncoded();
            } finally {
                spec.clearPassword();
            }
        } catch (java.security.GeneralSecurityException error) {
            throw new IllegalStateException("Password hashing is unavailable.", error);
        }
    }

    public record AccountRequest(String username, String email, String password) {}
    public record FavoriteRequest(Set<Long> placeIds) {}
    public record SessionResponse(String token, String email, String username) {}
    public record AccountResponse(String email, String username) {}
}
