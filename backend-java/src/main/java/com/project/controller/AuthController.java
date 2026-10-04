package com.project.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private static final String ADMIN_TOKEN = createAdminToken();

    @Value("${app.admin.username:smriti_admin}")
    private String adminUsername;

    @Value("${app.admin.password:KathmanduSecrets2026!}")
    private String adminPassword;

    @PostMapping("/login")
    public ResponseEntity<String> login(@RequestBody Map<String, String> credentials) {
        if (adminUsername.isBlank() || adminPassword.isBlank()) {
            return ResponseEntity.internalServerError().body(
                    "Admin access is not configured. Set VALLEY_ADMIN_USERNAME and VALLEY_ADMIN_PASSWORD.");
        }
        if (credentials == null) {
            return ResponseEntity.badRequest().body("Administrative credentials are required.");
        }
        String username = credentials.get("username");
        String password = credentials.get("password");

        if (adminUsername.equals(username) && adminPassword.equals(password)) {
            return ResponseEntity.ok(ADMIN_TOKEN);
        }
        return ResponseEntity.status(401).body("Invalid administrative parameters.");
    }

    public static boolean isValidAdminToken(String token) {
        return token != null && MessageDigest.isEqual(
                ADMIN_TOKEN.getBytes(StandardCharsets.US_ASCII),
                token.getBytes(StandardCharsets.US_ASCII));
    }

    private static String createAdminToken() {
        byte[] tokenBytes = new byte[32];
        new SecureRandom().nextBytes(tokenBytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
    }
}