package com.project.repository;

import com.project.model.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    List<Review> findByPlaceIdOrderByCreatedAtDesc(Long placeId);
    Optional<Review> findByIdAndPhotoDataIsNotNull(Long id);
    void deleteByPlaceId(Long placeId);
}
