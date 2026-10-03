package com.project.controller;

import com.project.model.Place;
import com.project.model.Review;
import com.project.repository.PlaceRepository;
import com.project.repository.ReviewLikeRepository;
import com.project.repository.ReviewRepository;
import com.project.repository.ReviewReplyRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/places")
@CrossOrigin(origins = "*") 
public class PlaceController {

    @Autowired
    private PlaceRepository placeRepository;
    @Autowired
    private ReviewRepository reviewRepository;
    @Autowired
    private ReviewReplyRepository reviewReplyRepository;
    @Autowired
    private ReviewLikeRepository reviewLikeRepository;

    private boolean isUnauthorized(String token) {
        return !AuthController.isValidAdminToken(token);
    }

    @GetMapping
    public List<Place> getAllPlaces() {
        return placeRepository.findAll();
    }

    @PostMapping("/{id}/rate")
    public ResponseEntity<?> addRating(@PathVariable Long id, @RequestBody Integer score) {
        if (score == null || score < 1 || score > 5) {
            return ResponseEntity.badRequest().body("Rating must be between 1 and 5.");
        }
        Place place = placeRepository.findById(id).orElse(null);
        if (place == null) {
            return ResponseEntity.notFound().build();
        }
        place.getRatings().add(score);
        return ResponseEntity.ok(placeRepository.save(place));
    }

    @PostMapping("/{id}/comment")
    public Place addComment(@PathVariable Long id, @RequestBody String text) {
        Place place = placeRepository.findById(id).orElseThrow();
        place.getComments().add(text);
        return placeRepository.save(place);
    }

    @PostMapping("/admin/add")
    public ResponseEntity<?> createNewPlace(@RequestBody Place newPlace, @RequestHeader(value="X-Admin-Token", required=false) String token) {
        if (isUnauthorized(token)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        return ResponseEntity.ok(placeRepository.save(newPlace));
    }

    @PutMapping("/admin/edit/{id}")
    public ResponseEntity<?> updatePlaceDetails(@PathVariable Long id, @RequestBody Place updatedData, @RequestHeader(value="X-Admin-Token", required=false) String token) {
        if (isUnauthorized(token)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        
        return placeRepository.findById(id).map(place -> {
            place.setName(updatedData.getName());
            place.setCity(updatedData.getCity());
            place.setPhotoUrl(updatedData.getPhotoUrl());
            place.setPhotoCredit(updatedData.getPhotoCredit());
            place.setPhotoSourceUrl(updatedData.getPhotoSourceUrl());
            place.setMapUrl(updatedData.getMapUrl());
            place.setDescription(updatedData.getDescription());
            return ResponseEntity.ok(placeRepository.save(place));
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/admin/delete/{id}")
    @Transactional
    public ResponseEntity<?> removePlace(@PathVariable Long id, @RequestHeader(value="X-Admin-Token", required=false) String token) {
        if (isUnauthorized(token)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        List<Long> reviewIds = reviewRepository.findByPlaceIdOrderByCreatedAtDesc(id).stream()
                .map(Review::getId)
                .toList();
        if (!reviewIds.isEmpty()) {
            reviewReplyRepository.deleteByReviewIdIn(reviewIds);
            reviewLikeRepository.deleteByReviewIdIn(reviewIds);
        }
        reviewRepository.deleteByPlaceId(id);
        placeRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}