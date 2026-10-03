package com.project.controller;

import com.project.model.Place;
import com.project.model.Review;
import com.project.model.ReviewLike;
import com.project.model.ReviewReply;
import com.project.repository.PlaceRepository;
import com.project.repository.ReviewLikeRepository;
import com.project.repository.ReviewRepository;
import com.project.repository.ReviewReplyRepository;
import com.project.service.VisitorAccountService;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import java.util.Iterator;
import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/places/{placeId}/reviews")
@CrossOrigin(origins = "*")
public class ReviewController {
    private static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    private static final long MAX_IMAGE_PIXELS = 20_000_000L;

    private final ReviewRepository reviewRepository;
    private final PlaceRepository placeRepository;
    private final ReviewReplyRepository replyRepository;
    private final ReviewLikeRepository likeRepository;
    private final VisitorAccountService accountService;

    public ReviewController(
            ReviewRepository reviewRepository,
            PlaceRepository placeRepository,
            ReviewReplyRepository replyRepository,
            ReviewLikeRepository likeRepository,
            VisitorAccountService accountService) {
        this.reviewRepository = reviewRepository;
        this.placeRepository = placeRepository;
        this.replyRepository = replyRepository;
        this.likeRepository = likeRepository;
        this.accountService = accountService;
    }

    @GetMapping
    public ResponseEntity<?> getReviews(
            @PathVariable Long placeId,
            @RequestHeader(value = "X-Admin-Token", required = false) String token,
            @RequestHeader(value = "X-Visitor-Id", required = false) String visitorId) {
        if (!placeRepository.existsById(placeId)) {
            return ResponseEntity.notFound().build();
        }
        if (visitorId != null && !isValidVisitorId(visitorId)) {
            return ResponseEntity.badRequest().body("A valid visitor identifier is required.");
        }
        boolean isAdmin = AuthController.isValidAdminToken(token);
        List<Review> reviews = reviewRepository.findByPlaceIdOrderByCreatedAtDesc(placeId).stream()
                .filter(review -> isAdmin || !review.isHidden())
                .toList();
        List<Long> reviewIds = reviews.stream().map(Review::getId).toList();
        Map<Long, List<ReplyResponse>> repliesByReview = replyRepository
                .findByReviewIdInOrderByCreatedAtAsc(reviewIds).stream()
                .collect(Collectors.groupingBy(
                        ReviewReply::getReviewId,
                        Collectors.mapping(this::toReplyResponse, Collectors.toList())));
        return ResponseEntity.ok(reviews.stream()
                .map(review -> toReviewResponse(review, repliesByReview.getOrDefault(review.getId(), List.of()),
                        visitorId, isAdmin))
                .toList());
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ResponseEntity<?> createReview(
            @PathVariable Long placeId,
            @RequestParam(required = false) String name,
            @RequestParam String comment,
            @RequestParam(required = false) Integer rating,
            @RequestParam(required = false) MultipartFile photo,
            @RequestHeader(value = "X-Visitor-Token", required = false) String visitorToken) throws IOException {
        var visitorAccount = accountService.findByToken(visitorToken).orElse(null);
        if (visitorAccount == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in with your email to write a review.");
        }
        String reviewerName = accountDisplayName(visitorAccount);
        String reviewText = comment.trim();
        if (reviewText.isEmpty() || reviewText.length() > 1500) {
            return ResponseEntity.badRequest().body("Review must be between 1 and 1500 characters.");
        }
        if (rating != null && (rating < 1 || rating > 5)) {
            return ResponseEntity.badRequest().body("Rating must be between 1 and 5.");
        }
        Place place = placeRepository.findById(placeId).orElse(null);
        if (place == null) {
            return ResponseEntity.notFound().build();
        }

        Review review = new Review();
        review.setPlaceId(placeId);
        review.setReviewerName(reviewerName);
        review.setVisitorAccountId(visitorAccount.getId());
        review.setComment(reviewText);
        review.setRating(rating);

        if (photo != null && !photo.isEmpty()) {
            if (photo.getSize() > MAX_IMAGE_BYTES) {
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Photo must be 5 MB or smaller.");
            }
            byte[] photoData = photo.getBytes();
            String contentType;
            try {
                contentType = validatedImageContentType(photoData);
            } catch (IOException invalidImage) {
                return ResponseEntity.badRequest().body("Photo must be a valid JPEG or PNG image.");
            }
            if (contentType == null) {
                return ResponseEntity.badRequest().body("Photo must be a valid JPEG or PNG image.");
            }
            review.setPhotoContentType(contentType);
            review.setPhotoData(photoData);
        }

        Review savedReview = reviewRepository.save(review);
        if (rating != null) {
            place.getRatings().add(rating);
            placeRepository.save(place);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(toReviewResponse(savedReview, List.of(), null, false));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<String> handleOversizedPhoto() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body("Photo must be 5 MB or smaller.");
    }

    @PostMapping("/{reviewId}/replies")
    public ResponseEntity<?> addReply(
            @PathVariable Long placeId,
            @PathVariable Long reviewId,
            @RequestBody ReplyRequest request,
            @RequestHeader(value = "X-Admin-Token", required = false) String token,
            @RequestHeader(value = "X-Visitor-Token", required = false) String visitorToken) {
        boolean isAdmin = AuthController.isValidAdminToken(token);
        var visitorAccount = accountService.findByToken(visitorToken).orElse(null);
        if (!isAdmin && visitorToken != null && !visitorToken.isBlank() && visitorAccount == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Sign in to reply with your account.");
        }
        if (request == null || request.comment() == null || request.comment().trim().isEmpty()
                || request.comment().trim().length() > 1500) {
            return ResponseEntity.badRequest().body("Reply must be between 1 and 1500 characters.");
        }
        String replyName = isAdmin ? "Admin"
                : visitorAccount != null ? accountDisplayName(visitorAccount)
                : request.name() == null ? "" : request.name().trim();
        if (replyName.isEmpty() || replyName.length() > 80) {
            return ResponseEntity.badRequest().body("Name must be between 1 and 80 characters.");
        }
        Review review = reviewRepository.findById(reviewId)
                .filter(item -> placeId.equals(item.getPlaceId()))
                .orElse(null);
        if (review == null) {
            return ResponseEntity.notFound().build();
        }
        if (review.isHidden() && !isAdmin) {
            return ResponseEntity.notFound().build();
        }

        ReviewReply reply = new ReviewReply();
        reply.setReviewId(reviewId);
        reply.setName(replyName);
        reply.setComment(request.comment().trim());
        reply.setAdminReply(isAdmin);
        return ResponseEntity.status(HttpStatus.CREATED).body(toReplyResponse(replyRepository.save(reply)));
    }

    @PostMapping("/{reviewId}/likes")
    @Transactional
    public ResponseEntity<?> toggleLike(
            @PathVariable Long placeId,
            @PathVariable Long reviewId,
            @RequestHeader(value = "X-Visitor-Id", required = false) String visitorId) {
        if (!isValidVisitorId(visitorId)) {
            return ResponseEntity.badRequest().body("A valid visitor identifier is required to like a review.");
        }
        Review review = reviewRepository.findById(reviewId)
                .filter(item -> placeId.equals(item.getPlaceId()) && !item.isHidden())
                .orElse(null);
        if (review == null) {
            return ResponseEntity.notFound().build();
        }
        boolean liked;
        if (likeRepository.existsByReviewIdAndVisitorId(reviewId, visitorId)) {
            likeRepository.deleteByReviewIdAndVisitorId(reviewId, visitorId);
            liked = false;
        } else {
            likeRepository.save(new ReviewLike(reviewId, visitorId));
            liked = true;
        }
        return ResponseEntity.ok(new LikeResponse(likeRepository.countByReviewId(reviewId), liked));
    }

    @PatchMapping("/admin/{reviewId}/visibility")
    @Transactional
    public ResponseEntity<?> setReviewVisibility(
            @PathVariable Long placeId,
            @PathVariable Long reviewId,
            @RequestParam boolean hidden,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!AuthController.isValidAdminToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        }
        return reviewRepository.findById(reviewId)
                .filter(review -> placeId.equals(review.getPlaceId()))
                .map(review -> {
                    review.setHidden(hidden);
                    return ResponseEntity.ok(reviewRepository.save(review));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/admin/{reviewId}")
    @Transactional
    public ResponseEntity<?> deleteReview(
            @PathVariable Long placeId,
            @PathVariable Long reviewId,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!AuthController.isValidAdminToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        }
        return reviewRepository.findById(reviewId)
                .filter(review -> placeId.equals(review.getPlaceId()))
                .map(review -> {
                    replyRepository.deleteByReviewId(reviewId);
                    likeRepository.deleteByReviewId(reviewId);
                    reviewRepository.delete(review);
                    return ResponseEntity.noContent().build();
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/admin")
    public ResponseEntity<?> deletePlaceReviews(
            @PathVariable Long placeId,
            @RequestHeader(value = "X-Admin-Token", required = false) String token) {
        if (!AuthController.isValidAdminToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Access denied.");
        }
        List<Long> reviewIds = reviewRepository.findByPlaceIdOrderByCreatedAtDesc(placeId).stream()
                .map(Review::getId)
                .toList();
        if (!reviewIds.isEmpty()) {
            replyRepository.deleteByReviewIdIn(reviewIds);
            likeRepository.deleteByReviewIdIn(reviewIds);
        }
        reviewRepository.deleteByPlaceId(placeId);
        return ResponseEntity.noContent().build();
    }

    private ReviewResponse toReviewResponse(
            Review review, List<ReplyResponse> replies, String visitorId, boolean isAdmin) {
        String photoUrl = review.getPhotoData() == null ? null : "/api/reviews/" + review.getId() + "/photo";
        return new ReviewResponse(review.getId(), review.getPlaceId(), review.getReviewerName(),
                review.getComment(), review.getRating(), review.getCreatedAt(), photoUrl,
                likeRepository.countByReviewId(review.getId()),
                visitorId != null && likeRepository.existsByReviewIdAndVisitorId(review.getId(), visitorId),
                review.isHidden(), replies);
    }

    private ReplyResponse toReplyResponse(ReviewReply reply) {
        return new ReplyResponse(reply.getId(), reply.getName(), reply.getComment(), reply.isAdminReply(),
                reply.getCreatedAt());
    }

    private String accountDisplayName(com.project.model.VisitorAccount account) {
        if (account.getUsername() != null && !account.getUsername().isBlank()) return account.getUsername();
        return account.getEmail().substring(0, account.getEmail().indexOf('@'));
    }

    private boolean isValidVisitorId(String visitorId) {
        if (visitorId == null) return false;
        try {
            UUID.fromString(visitorId);
            return true;
        } catch (IllegalArgumentException invalidId) {
            return false;
        }
    }

    private String validatedImageContentType(byte[] imageData) throws IOException {
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(imageData))) {
            if (input == null) return null;
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) return null;

            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName();
                String contentType = switch (format.toLowerCase()) {
                    case "jpeg", "jpg" -> MediaType.IMAGE_JPEG_VALUE;
                    case "png" -> MediaType.IMAGE_PNG_VALUE;
                    default -> null;
                };
                if (contentType == null) return null;
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                return pixels <= MAX_IMAGE_PIXELS ? contentType : null;
            } finally {
                reader.dispose();
            }
        }
    }

    public record ReviewResponse(
            Long id,
            Long placeId,
            String name,
            String comment,
            Integer rating,
            java.time.Instant createdAt,
            String photoUrl,
            long likeCount,
            boolean likedByMe,
            boolean hidden,
            List<ReplyResponse> replies) {}

    public record ReplyRequest(String name, String comment) {}

    public record ReplyResponse(Long id, String name, String comment, boolean adminReply,
                                java.time.Instant createdAt) {}

    public record LikeResponse(long likeCount, boolean liked) {}

    @RestController
    @RequestMapping("/api/reviews")
    @CrossOrigin(origins = "*")
    public static class ReviewPhotoController {
        private final ReviewRepository reviewRepository;

        public ReviewPhotoController(ReviewRepository reviewRepository) {
            this.reviewRepository = reviewRepository;
        }

        @GetMapping("/{reviewId}/photo")
        @Transactional(readOnly = true)
        public ResponseEntity<ByteArrayResource> getReviewPhoto(@PathVariable Long reviewId) {
            return reviewRepository.findByIdAndPhotoDataIsNotNull(reviewId)
                    .<ResponseEntity<ByteArrayResource>>map(review -> ResponseEntity.ok()
                            .contentType(MediaType.parseMediaType(review.getPhotoContentType()))
                            .header("X-Content-Type-Options", "nosniff")
                            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePublic())
                            .body(new ByteArrayResource(review.getPhotoData())))
                    .orElseGet(() -> ResponseEntity.notFound().build());
        }
    }
}
