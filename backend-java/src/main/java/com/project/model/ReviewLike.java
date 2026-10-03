package com.project.model;

import jakarta.persistence.*;

@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"reviewId", "visitorId"}))
public class ReviewLike {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long reviewId;
    private String visitorId;

    public ReviewLike() {}

    public ReviewLike(Long reviewId, String visitorId) {
        this.reviewId = reviewId;
        this.visitorId = visitorId;
    }

    public Long getId() { return id; }
    public Long getReviewId() { return reviewId; }
    public String getVisitorId() { return visitorId; }
}
