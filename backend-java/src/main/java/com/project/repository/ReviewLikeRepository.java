package com.project.repository;

import com.project.model.ReviewLike;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;

public interface ReviewLikeRepository extends JpaRepository<ReviewLike, Long> {
    boolean existsByReviewIdAndVisitorId(Long reviewId, String visitorId);
    long countByReviewId(Long reviewId);
    void deleteByReviewIdAndVisitorId(Long reviewId, String visitorId);
    void deleteByReviewId(Long reviewId);
    void deleteByReviewIdIn(Collection<Long> reviewIds);
}
