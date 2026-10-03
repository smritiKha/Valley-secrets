package com.project.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
public class Review {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long placeId;
    private String reviewerName;
    private Long visitorAccountId;

    @Column(columnDefinition = "TEXT")
    private String comment;

    private Integer rating;
    private Boolean hidden = false;
    private Instant createdAt = Instant.now();
    private String photoContentType;

    @Lob
    @JsonIgnore
    private byte[] photoData;

    public Long getId() { return id; }
    public Long getPlaceId() { return placeId; }
    public void setPlaceId(Long placeId) { this.placeId = placeId; }
    public String getReviewerName() { return reviewerName; }
    public void setReviewerName(String reviewerName) { this.reviewerName = reviewerName; }
    public Long getVisitorAccountId() { return visitorAccountId; }
    public void setVisitorAccountId(Long visitorAccountId) { this.visitorAccountId = visitorAccountId; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public Integer getRating() { return rating; }
    public void setRating(Integer rating) { this.rating = rating; }
    public boolean isHidden() { return Boolean.TRUE.equals(hidden); }
    public void setHidden(boolean hidden) { this.hidden = hidden; }
    public Instant getCreatedAt() { return createdAt; }
    public String getPhotoContentType() { return photoContentType; }
    public void setPhotoContentType(String photoContentType) { this.photoContentType = photoContentType; }
    public byte[] getPhotoData() { return photoData; }
    public void setPhotoData(byte[] photoData) { this.photoData = photoData; }
}
