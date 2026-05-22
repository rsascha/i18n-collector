package de.actyvyst.api;

import de.actyvyst.api.translation.I18nProperties;
import de.actyvyst.api.translation.SyncProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({I18nProperties.class, SyncProperties.class})
public class ApiApplication {

    static void main(String[] args) {
        SpringApplication.run(ApiApplication.class, args);
    }

}
