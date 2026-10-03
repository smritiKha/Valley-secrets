package com.project;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootApplication
public class Application {
    public static void main(String[] args) throws IOException {
        Files.createDirectories(Path.of(System.getProperty("user.home"), ".valley-secrets"));
        SpringApplication.run(Application.class, args);
    }
}