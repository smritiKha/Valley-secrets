package com.project.service;

import com.project.model.VisitorAccount;
import com.project.repository.VisitorAccountRepository;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

@Service
public class VisitorAccountService {
    private final VisitorAccountRepository accountRepository;

    public VisitorAccountService(VisitorAccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    public Optional<VisitorAccount> findByToken(String token) {
        if (token == null || token.isBlank() || token.length() > 200) return Optional.empty();
        return accountRepository.findBySessionTokenHashAndSessionExpiresAtAfter(hashToken(token), Instant.now());
    }

    public static String hashToken(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable.", impossible);
        }
    }
}
