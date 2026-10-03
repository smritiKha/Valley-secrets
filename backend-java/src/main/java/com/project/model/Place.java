package com.project.model;

import jakarta.persistence.*;
import java.util.List;
import java.util.ArrayList;

@Entity
public class Place {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private String city;
    private String photoUrl;
    private String photoCredit;
    private String photoSourceUrl;
    private String mapUrl;
    @Column(columnDefinition = "TEXT")
    private String description;

    @ElementCollection
    private List<Integer> ratings = new ArrayList<>();

    @ElementCollection
    private List<String> comments = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPhotoUrl() { return photoUrl; }
    public void setPhotoUrl(String photoUrl) { this.photoUrl = photoUrl; }
    public String getPhotoCredit() { return photoCredit; }
    public void setPhotoCredit(String photoCredit) { this.photoCredit = photoCredit; }
    public String getPhotoSourceUrl() { return photoSourceUrl; }
    public void setPhotoSourceUrl(String photoSourceUrl) { this.photoSourceUrl = photoSourceUrl; }
    public String getMapUrl() { return mapUrl; }
    public void setMapUrl(String mapUrl) { this.mapUrl = mapUrl; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public List<Integer> getRatings() { return ratings; }
    public List<String> getComments() { return comments; }
}