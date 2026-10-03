package com.project.repository;

import com.project.model.VisitorAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.Optional;

public interface VisitorAccountRepository extends JpaRepository<VisitorAccount, Long> {
    Optional<VisitorAccount> findByEmail(String email);
    Optional<VisitorAccount> findBySessionTokenHashAndSessionExpiresAtAfter(String sessionTokenHash, Instant now);
}
