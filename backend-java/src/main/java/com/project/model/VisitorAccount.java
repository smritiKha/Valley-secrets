package com.project.model;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Column;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "visitor_account")
public class VisitorAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(length = 80)
    private String username;

    @Column(nullable = false, length = 200)
    private String passwordHash;

    @Column(length = 64)
    private String sessionTokenHash;

    private Instant sessionExpiresAt;

    @ElementCollection(fetch = FetchType.EAGER)
    private Set<Long> favoritePlaceIds = new HashSet<>();

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getSessionTokenHash() { return sessionTokenHash; }
    public void setSessionTokenHash(String sessionTokenHash) { this.sessionTokenHash = sessionTokenHash; }
    public Instant getSessionExpiresAt() { return sessionExpiresAt; }
    public void setSessionExpiresAt(Instant sessionExpiresAt) { this.sessionExpiresAt = sessionExpiresAt; }
    public Set<Long> getFavoritePlaceIds() { return favoritePlaceIds; }
    public void setFavoritePlaceIds(Set<Long> favoritePlaceIds) { this.favoritePlaceIds = favoritePlaceIds; }
}
