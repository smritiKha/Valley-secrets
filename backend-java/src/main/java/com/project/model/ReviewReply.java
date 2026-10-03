package com.project.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
public class ReviewReply {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long reviewId;
    private String name;

    @Column(columnDefinition = "TEXT")
    private String comment;

    private boolean adminReply;
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public Long getReviewId() { return reviewId; }
    public void setReviewId(Long reviewId) { this.reviewId = reviewId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public boolean isAdminReply() { return adminReply; }
    public void setAdminReply(boolean adminReply) { this.adminReply = adminReply; }
    public Instant getCreatedAt() { return createdAt; }
}
