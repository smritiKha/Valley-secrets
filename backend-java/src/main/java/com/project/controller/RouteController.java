package com.project.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/routes")
@CrossOrigin(origins = "*")
public class RouteController {
    private static final Logger LOGGER = LoggerFactory.getLogger(RouteController.class);
    private final RestClient restClient = RestClient.create();

    @PostMapping("/table")
    public ResponseEntity<?> getRouteTable(@RequestBody RouteRequest request) {
        if (request == null || !List.of("driving", "walking").contains(request.mode())
                || !isValidCoordinate(request.origin())
                || request.destinations() == null
                || request.destinations().isEmpty()
                || request.destinations().size() > 100
                || request.destinations().stream().anyMatch(coordinate -> !isValidCoordinate(coordinate))) {
            return ResponseEntity.badRequest().body("Route request contains invalid coordinates or travel mode.");
        }

        String profile = request.mode().equals("driving") ? "car" : "foot";
        List<Coordinate> coordinates = new java.util.ArrayList<>();
        coordinates.add(request.origin());
        coordinates.addAll(request.destinations());
        String points = coordinates.stream()
                .map(coordinate -> coordinate.longitude() + "," + coordinate.latitude())
                .collect(java.util.stream.Collectors.joining(";"));
        String destinations = java.util.stream.IntStream.rangeClosed(1, request.destinations().size())
                .mapToObj(Integer::toString)
                .collect(java.util.stream.Collectors.joining(";"));
        URI routeUri = URI.create("https://routing.openstreetmap.de/routed-" + profile
                + "/table/v1/driving/" + points
                + "?sources=0&destinations=" + destinations + "&annotations=distance,duration");

        try {
            RouteTableResponse result = restClient.get().uri(routeUri)
                    .header("User-Agent", "ValleySecrets/1.0")
                    .accept(org.springframework.http.MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(RouteTableResponse.class);
            if (result == null || !"Ok".equals(result.code())
                    || result.distances() == null || result.durations() == null) {
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("The routing service returned no route estimates.");
            }
            return ResponseEntity.ok(result);
        } catch (RestClientResponseException error) {
            LOGGER.warn("OpenStreetMap routing service returned HTTP {}", error.getStatusCode().value());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body("OpenStreetMap routing is temporarily unavailable (HTTP "
                            + error.getStatusCode().value() + ").");
        } catch (ResourceAccessException error) {
            LOGGER.warn("Could not connect to OpenStreetMap routing service.");
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body("The routing service is temporarily unavailable.");
        }
    }

    private boolean isValidCoordinate(Coordinate coordinate) {
        return coordinate != null
                && Double.isFinite(coordinate.latitude())
                && Double.isFinite(coordinate.longitude())
                && coordinate.latitude() >= -90 && coordinate.latitude() <= 90
                && coordinate.longitude() >= -180 && coordinate.longitude() <= 180;
    }

    public record Coordinate(double latitude, double longitude) {}
    public record RouteRequest(String mode, Coordinate origin, List<Coordinate> destinations) {}
    public record RouteTableResponse(String code, List<List<Double>> distances, List<List<Double>> durations) {}
}
