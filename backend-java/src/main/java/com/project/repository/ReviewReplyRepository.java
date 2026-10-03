package com.project.repository;

import com.project.model.ReviewReply;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Collection;
import java.util.List;

public interface ReviewReplyRepository extends JpaRepository<ReviewReply, Long> {
    List<ReviewReply> findByReviewIdInOrderByCreatedAtAsc(Collection<Long> reviewIds);
    void deleteByReviewId(Long reviewId);
    void deleteByReviewIdIn(Collection<Long> reviewIds);
}
